const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const QRCode = require('qrcode-terminal');
const { setting } = require('./setting.js');
const { ping, info, menu, stalk, hidetag, kick, add, setdesc, setname, leave, owner } = require('./main.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

let sock = null;
let qrCodeData = null;
let pairingCodeData = null;

// ============================================================
// FUNGSI BUAT SOCKET (printQRInTerminal: false)
// ============================================================
function createSocket(auth, version, printQR = false) {
    return makeWASocket({
        version,
        auth: auth,
        printQRInTerminal: printQR, // <--- BISA TRUE/FALSE
        browser: ['Baileys', 'Chrome', '120.0.0.0'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        defaultQueryTimeoutMs: 60000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false
    });
}

// ============================================================
// API PAIR
// ============================================================
app.post('/api/pair', async (req, res) => {
    try {
        const { phone, method } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, error: 'Nomor HP wajib diisi!' });
        }

        const clean = phone.replace(/\D/g, '');
        console.log('📱 Request untuk:', clean);
        console.log('📱 Metode:', method || 'pairing');

        if (fs.existsSync('./session')) {
            fs.rmSync('./session', { recursive: true, force: true });
        }
        fs.mkdirSync('./session');

        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const { version } = await fetchLatestBaileysVersion();

        console.log('📦 Baileys v' + version.join('.'));

        // ============================================================
        // 1. PAIRING CODE (GAK PAKE QR SAMA SEKALI)
        // ============================================================
        if (method === 'pairing' || !method) {
            sock = createSocket(state, version, false); // printQR: FALSE!
            sock.ev.on('creds.update', saveCreds);

            try {
                const code = await sock.requestPairingCode(clean);
                pairingCodeData = code;
                console.log('✅ PAIRING CODE:', code);
                return res.json({
                    success: true,
                    code: code,
                    method: 'pairing'
                });
            } catch (pairingError) {
                console.log('⚠️ Pairing code error:', pairingError.message);
                return res.json({
                    success: false,
                    error: 'Pairing code gagal, coba metode QR Code'
                });
            }
        }

        // ============================================================
        // 2. QR CODE (BARU DI SINI printQRInTerminal: TRUE!)
        // ============================================================
        if (method === 'qr') {
            sock = createSocket(state, version, true); // printQR: TRUE!
            sock.ev.on('creds.update', saveCreds);

            let qrResolve = null;
            let qrTimeout = null;

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    qrCodeData = qr;
                    console.log('\n📱 QR CODE GENERATED!');
                    QRCode.generate(qr, { small: true });
                    console.log('\n📱 Scan QR Code di terminal atau web!\n');
                    if (qrResolve) {
                        qrResolve(qr);
                        qrResolve = null;
                    }
                }

                if (connection === 'open') {
                    console.log('✅ BOT CONNECTED!');
                    console.log('📱 Nomor:', sock.authState.creds.me?.id || 'Unknown');
                    qrCodeData = null;
                    pairingCodeData = null;
                }

                if (connection === 'close') {
                    const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                    console.log('❌ Disconnected:', statusCode);
                    if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                        if (fs.existsSync('./session')) {
                            fs.rmSync('./session', { recursive: true, force: true });
                        }
                    }
                    setTimeout(startBot, 5000);
                }
            });

            const qrPromise = new Promise((resolve) => {
                qrResolve = resolve;
                qrTimeout = setTimeout(() => {
                    if (qrResolve) {
                        qrResolve(null);
                        qrResolve = null;
                    }
                }, 30000);
            });

            const qr = await qrPromise;
            clearTimeout(qrTimeout);

            if (qr) {
                return res.json({
                    success: true,
                    qr: qr,
                    method: 'qr'
                });
            } else {
                return res.json({
                    success: false,
                    error: 'QR Code gagal dibuat, coba metode Pairing Code'
                });
            }
        }

        return res.json({
            success: false,
            error: 'Metode tidak dikenal'
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/status', (req, res) => {
    const botId = sock?.authState?.creds?.me?.id || null;
    res.json({
        status: sock ? 'connected' : 'disconnected',
        botNumber: botId,
        qr: qrCodeData || null,
        pairingCode: pairingCodeData || null
    });
});

app.post('/api/reset', async (req, res) => {
    try {
        if (sock) {
            await sock.end();
            sock = null;
        }
        qrCodeData = null;
        pairingCodeData = null;
        if (fs.existsSync('./session')) {
            fs.rmSync('./session', { recursive: true, force: true });
        }
        setTimeout(startBot, 3000);
        res.json({ success: true, message: 'Bot direset!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// START BOT (printQRInTerminal: FALSE!)
// ============================================================
async function startBot() {
    try {
        if (fs.existsSync('./session')) {
            fs.rmSync('./session', { recursive: true, force: true });
        }
        fs.mkdirSync('./session');

        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const { version } = await fetchLatestBaileysVersion();

        // ============================================================
        // GAK ADA QR DI SINI! printQRInTerminal: false
        // ============================================================
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

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // QR KELUAR, TAPI GAK DI PRINT DI TERMINAL KARENA printQRInTerminal: false
                // CUMA DISIMPEN BUAT DI KIRIM KE WEB KALO DI REQUEST
                qrCodeData = qr;
                console.log('📱 QR Code tersedia (cek web)');
            }

            if (connection === 'open') {
                console.log('✅ BOT CONNECTED!');
                console.log('📱 Nomor:', sock.authState.creds.me?.id || 'Unknown');
                qrCodeData = null;
                pairingCodeData = null;
            }

            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log('❌ Disconnected:', statusCode);
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    if (fs.existsSync('./session')) {
                        fs.rmSync('./session', { recursive: true, force: true });
                    }
                }
                setTimeout(startBot, 5000);
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
                const isGroup = chatId.endsWith('@g.us');

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
                console.error('❌ Error:', error.message);
            }
        });

    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        setTimeout(startBot, 5000);
    }
}

const server = app.listen(0, '0.0.0.0', () => {
    const actualPort = server.address().port;
    console.log('🌐 Server running on port', actualPort);
    console.log('🔗 https://' + process.env.RAILWAY_STATIC_URL || 'railway.app');
    startBot();
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log('⚠️ Port sibuk, coba port lain...');
        const newServer = app.listen(0, '0.0.0.0', () => {
            console.log('🌐 Server running on port', newServer.address().port);
        });
    }
});