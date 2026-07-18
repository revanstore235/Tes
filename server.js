const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const { setting } = require('./setting.js');
const { ping, info, menu, stalk, hidetag, kick, add, setdesc, setname, leave, owner } = require('./main.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT ? Number(process.env.PORT) : 0;
const HOST = '0.0.0.0';

let sock = null;
let createState = null; // for main session
let creatingSocket = false;
let connectionStatus = 'disconnected';
let botNumber = null;

async function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function startBot() {
    if (sock) return;
    if (creatingSocket) return;
    creatingSocket = true;
    connectionStatus = 'connecting';

    try {
        await ensureDir('./session');
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        createState = { state, saveCreds };
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ['Baileys', 'Chrome', '120.0.0.0'],
            connectTimeoutMs: 120000,
            keepAliveIntervalMs: 20000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false
        });

        if (createState?.saveCreds) sock.ev.on('creds.update', createState.saveCreds);

        sock.ev.on('connection.update', (update) => {
            console.log('connection.update =>', JSON.stringify(update));
            const { connection, lastDisconnect, qr } = update;
            if (qr) connectionStatus = 'pairing';
            if (connection) connectionStatus = connection;
            if (connection === 'open') {
                botNumber = sock?.authState?.creds?.me?.id || null;
                console.log('✅ BOT CONNECTED! as', botNumber);
                connectionStatus = 'open';
            }
            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log('connection closed, statusCode=', statusCode);
                connectionStatus = 'close';
                botNumber = null;
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    try { fs.rmSync('./session', { recursive: true, force: true }); } catch(e){}
                    sock = null; createState = null;
                }
                setTimeout(() => {
                    sock = null;
                    startBot();
                }, 3000);
            }
        });

        sock.ev.on('pair-device', (info) => {
            console.log('pair-device =>', JSON.stringify(info));
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
                const msg = messages[0];
                if (!msg.message || msg.key.fromMe) return;
                let text = '';
                if (msg.message.conversation) text = msg.message.conversation;
                else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text || '';
                if (!text.startsWith(setting.prefix)) return;
                const args = text.slice(setting.prefix.length).trim().split(/ +/);
                const command = args.shift()?.toLowerCase();
                if (!command) return;
                const chatId = msg.key.remoteJid;
                console.log(`📨 [${command}]`);
                switch (command) {
                    case 'ping': await ping(sock, msg); break;
                    case 'info': await info(sock, msg); break;
                    case 'menu': await menu(sock, msg); break;
                    case 'stalk': await stalk(sock, msg, args); break;
                    case 'hidetag': case 'ht': case 'tagall': await hidetag(sock, msg, args); break;
                    case 'kick': await kick(sock, msg, args); break;
                    case 'add': await add(sock, msg, args); break;
                    case 'setdesc': await setdesc(sock, msg, args); break;
                    case 'setname': await setname(sock, msg, args); break;
                    case 'leave': await leave(sock, msg); break;
                    case 'owner': await owner(sock, msg); break;
                    default:
                        await sock.sendMessage(chatId, { text: `❌ Command *${command}* tidak dikenal!\nKetik *${setting.prefix}menu*` });
                        break;
                }
            } catch (error) { console.error('❌ Message handler error:', error); }
        });

    } catch (error) {
        console.error('❌ Fatal error starting bot:', error);
        connectionStatus = 'disconnected';
        setTimeout(() => startBot(), 5000);
    } finally { creatingSocket = false; }
}

async function startPairingSocket(phone) {
    // create temporary auth folder
    const pairDir = './pair_session';
    await ensureDir(pairDir);
    // clean any previous pair session
    try { fs.rmSync(pairDir, { recursive: true, force: true }); } catch(e){}
    await ensureDir(pairDir);

    const { state, saveCreds } = await useMultiFileAuthState(pairDir);
    const { version } = await fetchLatestBaileysVersion();

    const pairSock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['Baileys', 'Chrome', 'PairingSocket'],
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 20000,
        defaultQueryTimeoutMs: 60000
    });

    // persist creds for temp socket
    if (saveCreds) pairSock.ev.on('creds.update', saveCreds);

    // prepare promise that resolves on successful pairing
    let resolved = false;
    const pairResult = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            try { pairSock.end(); } catch(e){}
            reject(new Error('pairing timeout'));
        }, 120000);

        pairSock.ev.on('connection.update', (update) => {
            console.log('[pair] connection.update =>', JSON.stringify(update));
            if (update.connection === 'open') {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);
                resolve({ success: true, reason: 'open' });
            }
            if (update.connection === 'close') {
                // if it closed without open, keep waiting until timeout rejects
                console.log('[pair] connection closed during pairing', update.lastDisconnect?.error?.message || '');
            }
        });

        pairSock.ev.on('pair-device', async (info) => {
            console.log('[pair] pair-device =>', JSON.stringify(info));
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            resolve({ success: true, reason: 'pair-device' });
        });
    });

    // request code
    const num = String(phone).replace(/\D/g, '');
    let resp;
    try {
        // try raw number first
        resp = await pairSock.requestPairingCode(num);
    } catch (e1) {
        console.warn('[pair] requestPairingCode raw failed', e1?.message);
        try { resp = await pairSock.requestPairingCode(`${num}@s.whatsapp.net`); } catch (e2) { throw e2; }
    }

    // parse code
    let code = null;
    if (!resp) throw new Error('no pairing response');
    if (typeof resp === 'string') code = resp;
    else if (resp.code) code = resp.code;
    else if (resp.qr && typeof resp.qr === 'string') {
        const maybe = resp.qr.match(/[A-Z0-9]{6,12}/);
        code = maybe ? maybe[0] : resp.qr;
    } else {
        for (const k of Object.keys(resp)) {
            if (typeof resp[k] === 'string' && /^[A-Z0-9]{6,12}$/.test(resp[k])) { code = resp[k]; break; }
        }
    }

    if (!code) throw new Error('unable to parse pairing code');

    // wait for pairing result in background, but return code immediately to client
    pairResult.then(async (r) => {
        console.log('[pair] succeeded:', r);
        try {
            // ensure temp creds saved
            if (saveCreds) await saveCreds();
        } catch(e) { console.error('[pair] saveCreds error', e); }

        // copy pair_session files into main session folder
        try {
            await ensureDir('./session');
            const files = fs.readdirSync(pairDir);
            for (const f of files) {
                const src = path.join(pairDir, f);
                const dest = path.join('./session', f);
                try { fs.copyFileSync(src, dest); } catch(e) { console.error('[pair] copyFile error', e); }
            }
            console.log('[pair] copied creds to main session');
        } catch(e) { console.error('[pair] error copying creds', e); }

        // restart main bot to load new creds
        try {
            if (sock) {
                try { await sock.end(); } catch(e) { console.error('error ending old sock', e); }
                sock = null; createState = null;
            }
            // give a short delay
            setTimeout(() => startBot(), 1500);
        } catch(e) { console.error('[pair] restart error', e); }

        // cleanup pair session
        try { fs.rmSync(pairDir, { recursive: true, force: true }); } catch(e) { console.error('[pair] cleanup error', e); }
    }).catch((err) => {
        console.warn('[pair] failed:', err?.message || err);
        try { fs.rmSync(pairDir, { recursive: true, force: true }); } catch(e){}
    });

    return code;
}

app.post('/api/pair', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ success: false, error: 'Nomor HP wajib diisi!' });

        // if main bot already authenticated, reject
        if (sock && sock.authState?.creds?.me) return res.status(400).json({ success: false, error: 'Bot sudah terautentikasi. Gunakan /api/reset untuk reset session.' });

        console.log('API /api/pair called for', phone);
        const code = await startPairingSocket(phone);
        console.log('Generated pairing code:', code);
        return res.json({ success: true, code });
    } catch (error) {
        console.error('❌ Error in /api/pair:', error);
        return res.status(500).json({ success: false, error: String(error) });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ status: connectionStatus === 'open' ? 'connected' : connectionStatus, botNumber: botNumber });
});

app.post('/api/reset', async (req, res) => {
    try {
        if (sock) { try { await sock.end(); } catch(e){}; sock = null; createState = null; }
        if (fs.existsSync('./session')) fs.rmSync('./session', { recursive: true, force: true });
        connectionStatus = 'disconnected'; botNumber = null;
        setTimeout(() => startBot(), 1000);
        res.json({ success: true, message: 'Bot direset!' });
    } catch (error) {
        console.error('❌ Error in /api/reset:', error);
        res.status(500).json({ success: false, error: String(error) });
    }
});

const server = app.listen(PORT, HOST, () => {
    const actualPort = server.address().port;
    console.log(`🌐 Server running on port ${actualPort}`);
    console.log('🔗', process.env.RAILWAY_STATIC_URL || 'local');
    startBot();
});

server.on('error', (err) => {
    console.error('❌ Server error during listen:', err);
    process.exit(1);
});
