const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const { setting } = require('./setting.js');
const { ping, info, menu, stalk, hidetag, kick, add, setdesc, setname, leave, owner } = require('./main.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Always use a random free port (0) so we don't collide with fixed ports like 8080
const DESIRED_PORT = 0;
const HOST = '0.0.0.0';

let sock = null;
let createState = null; // { state, saveCreds }
let creatingSocket = false;

async function ensureSessionDir() {
    if (!fs.existsSync('./session')) {
        fs.mkdirSync('./session', { recursive: true });
    }
}

async function startBot() {
    if (sock) return; // already running
    if (creatingSocket) return;
    creatingSocket = true;

    try {
        await ensureSessionDir();
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        createState = { state, saveCreds };
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ['Baileys', 'Chrome', '120.0.0.0'],
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false
        });

        if (saveCreds) {
            sock.ev.on('creds.update', async () => {
                try {
                    await saveCreds();
                } catch (e) {
                    console.error('❌ saveCreds error:', e);
                }
            });
        }

        sock.ev.on('connection.update', async (update) => {
            console.log('connection.update =>', update);
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log('✅ BOT CONNECTED!');
                console.log('📱 Nomor:', sock?.authState?.creds?.me?.id || 'Unknown');
            }
            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log('connection closed, statusCode=', statusCode);
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    if (fs.existsSync('./session')) {
                        try { fs.rmSync('./session', { recursive: true, force: true }); } catch (e) { console.error(e); }
                    }
                    sock = null;
                    createState = null;
                }
                // try reconnect
                setTimeout(() => {
                    sock = null;
                    startBot();
                }, 5000);
            }
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
                    case 'ping':
                        await ping(sock, msg);
                        break;
                    case 'info':
                        await info(sock, msg);
                        break;
                    case 'menu':
                        await menu(sock, msg);
                        break;
                    case 'stalk':
                        await stalk(sock, msg, args);
                        break;
                    case 'hidetag':
                    case 'ht':
                    case 'tagall':
                        await hidetag(sock, msg, args);
                        break;
                    case 'kick':
                        await kick(sock, msg, args);
                        break;
                    case 'add':
                        await add(sock, msg, args);
                        break;
                    case 'setdesc':
                        await setdesc(sock, msg, args);
                        break;
                    case 'setname':
                        await setname(sock, msg, args);
                        break;
                    case 'leave':
                        await leave(sock, msg);
                        break;
                    case 'owner':
                        await owner(sock, msg);
                        break;
                    default:
                        await sock.sendMessage(chatId, {
                            text: `❌ Command *${command}* tidak dikenal!\nKetik *${setting.prefix}menu*`
                        });
                        break;
                }
            } catch (error) {
                console.error('❌ Message handler error:', error);
            }
        });

    } catch (error) {
        console.error('❌ Fatal error starting bot:', error);
        // retry after delay
        setTimeout(() => startBot(), 5000);
    } finally {
        creatingSocket = false;
    }
}

app.post('/api/pair', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, error: 'Nomor HP wajib diisi!' });
        }

        const clean = phone.replace(/\D/g, '');
        // Ensure phone is in full JID format for pairing (e.g. 628123...@s.whatsapp.net)
        const jid = clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;

        console.log('📱 Pairing request for:', jid);

        // Ensure bot/socket exists
        if (!sock) {
            await startBot();
            // wait a short while for socket to initialize
            await new Promise(r => setTimeout(r, 1500));
        }

        if (!sock) {
            return res.status(500).json({ success: false, error: 'Gagal membuat koneksi ke WhatsApp. Coba lagi.' });
        }

        // Show connection updates in logs for debugging
        console.log('Requesting pairing code for JID:', jid);

        // Some Baileys versions expect a JID, others expect a phone number. Try both forms if needed.
        let resp;
        try {
            resp = await sock.requestPairingCode(jid);
        } catch (e1) {
            console.warn('requestPairingCode with JID failed, trying raw number:', e1?.message);
            try {
                resp = await sock.requestPairingCode(clean);
            } catch (e2) {
                console.error('Both requestPairingCode attempts failed:', e1, e2);
                throw e2 || e1;
            }
        }

        console.log('PAIRING RESPONSE =>', resp);

        // resp may be a string code, or an object { code } or { qr } depending on Baileys version
        if (!resp) {
            return res.status(500).json({ success: false, error: 'Tidak ada response dari requestPairingCode' });
        }

        if (typeof resp === 'string') {
            return res.json({ success: true, code: resp });
        }
        if (resp.code) {
            return res.json({ success: true, code: resp.code });
        }
        if (resp.qr) {
            return res.json({ success: true, qr: resp.qr });
        }

        // return entire object as fallback
        return res.json({ success: true, data: resp });
    } catch (error) {
        console.error('❌ Error in /api/pair:', error);
        return res.status(500).json({ success: false, error: String(error) });
    }
});

app.get('/api/status', (req, res) => {
    const botId = sock?.authState?.creds?.me?.id || null;
    res.json({
        status: sock ? 'connected' : 'disconnected',
        botNumber: botId
    });
});

app.post('/api/reset', async (req, res) => {
    try {
        if (sock) {
            try { await sock.end(); } catch (e) { console.error(e); }
            sock = null;
            createState = null;
        }
        if (fs.existsSync('./session')) {
            fs.rmSync('./session', { recursive: true, force: true });
        }
        setTimeout(startBot, 3000);
        res.json({ success: true, message: 'Bot direset!' });
    } catch (error) {
        console.error('❌ Error in /api/reset:', error);
        res.status(500).json({ success: false, error: String(error) });
    }
});

// Always bind to a random free port to avoid collisions (e.g. 8080 already in use)
const server = app.listen(DESIRED_PORT, HOST, () => {
    const actualPort = server.address().port;
    console.log(`🌐 Server running on port ${actualPort}`);
    console.log('🔗 https://' + (process.env.RAILWAY_STATIC_URL || 'railway.app'));
    // Start bot after server is listening
    startBot();
});

server.on('error', (err) => {
    console.error('❌ Server error during listen:', err);
    process.exit(1);
});
