const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const { setting } = require('./setting.js');
const { ping, info, menu, stalk, hidetag, kick, add, setdesc, setname, leave, owner } = require('./main.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = 0; // <--- RANDOM!

let sock = null;
let createState = null;
let creatingSocket = false;

async function ensureSessionDir() {
    if (!fs.existsSync('./session')) {
        fs.mkdirSync('./session', { recursive: true });
    }
}

async function startBot() {
    if (sock) return;
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
            browser: ['Ubuntu', 'Chrome', '120.0.0.0'],
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false
        });

        saveCreds && sock.ev.on('creds.update', saveCreds);

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

                if (
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === DisconnectReason.badSession
                ) {
                    if (fs.existsSync('./session')) {
                        try {
                            fs.rmSync('./session', {
                                recursive: true,
                                force: true
                            });
                        } catch (e) {
                            console.error(e);
                        }
                    }

                    sock = null;
                    createState = null;
                }

                setTimeout(() => {
                    sock = null;
                    startBot();
                }, 5000);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;

                const msg = messages?.[0];

                if (!msg) return;

                if (
                    msg.key?.remoteJid === 'status@broadcast' ||
                    msg.key?.remoteJid === 'newsletter'
                ) {
                    return;
                }

                if (!msg.message || msg.key.fromMe) return;

                let text = '';

                if (msg.message.conversation) {
                    text = msg.message.conversation;
                } else if (msg.message.extendedTextMessage) {
                    text = msg.message.extendedTextMessage.text || '';
                }

                if (!text) return;

                if (!text.startsWith(setting.prefix)) return;

                const args = text
                    .slice(setting.prefix.length)
                    .trim()
                    .split(/ +/);

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
                }
            } catch (error) {
                console.error('❌ Message handler error:', error);
                console.error(error?.stack);
            }
        });

    } catch (error) {
        console.error('❌ Fatal error starting bot:', error);

        setTimeout(() => startBot(), 5000);
    } finally {
        creatingSocket = false;
    }
}

function waitForSocketReady(timeout = 30000) {
    return new Promise((resolve, reject) => {
        if (!sock) {
            return reject(new Error('Socket belum dibuat'));
        }

        if (sock.user) {
            return resolve(true);
        }

        const timer = setTimeout(() => {
            sock.ev.off('connection.update', handler);
            reject(new Error('Timeout menunggu socket siap'));
        }, timeout);

        const handler = (update) => {
            if (
                update.connection === 'connecting' ||
                update.qr !== undefined
            ) {
                clearTimeout(timer);
                sock.ev.off('connection.update', handler);
                resolve(true);
            }
        };

        sock.ev.on('connection.update', handler);
    });
}

app.post('/api/pair', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'Nomor HP wajib diisi!'
            });
        }

        const clean = phone.replace(/\D/g, '').replace(/^0/, '62');

        console.log('📱 Pairing request for:', clean);

        if (!sock) {
            await startBot();
        }

        await waitForSocketReady();

        if (!sock) {
            return res.status(500).json({
                success: false,
                error: 'Gagal membuat koneksi ke WhatsApp. Coba lagi.'
            });
        }

        console.log('Requesting pairing code...');

        const code = await sock.requestPairingCode(clean.trim());

        console.log('✅ PAIRING CODE:', code);

        return res.json({
            success: true,
            code
        });

    } catch (error) {
        console.error('❌ Error in /api/pair:', error);

        return res.status(500).json({
            success: false,
            error: String(error)
        });
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
            try {
                await sock.end();
            } catch (e) {
                console.error(e);
            }

            sock = null;
            createState = null;
        }

        if (fs.existsSync('./session')) {
            fs.rmSync('./session', {
                recursive: true,
                force: true
            });
        }

        setTimeout(startBot, 3000);

        res.json({
            success: true,
            message: 'Bot direset!'
        });

    } catch (error) {
        console.error('❌ Error in /api/reset:', error);

        res.status(500).json({
            success: false,
            error: String(error)
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('🌐 Server running');
    console.log(
        '🔗 https://' +
        (process.env.RAILWAY_STATIC_URL || 'railway.app')
    );

    startBot();
});
