const express = require('express');
const cors = require('cors');
const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==========================================
// KONFIGURASI
// ==========================================
const OWNER_NUMBER = '6281284406156'; // GANTI DENGAN NOMOR LU!
const SESSION_PATH = './session';

let sock = null;
let pairingCode = null;
let botStatus = 'disconnected';
let botNumber = null;

// ==========================================
// START BOT
// ==========================================
async function startBot() {
    try {
        if (fs.existsSync(SESSION_PATH)) {
            fs.rmSync(SESSION_PATH, { recursive: true, force: true });
            console.log('🗑️ Session lama dihapus');
        }
        fs.mkdirSync(SESSION_PATH, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
        const { version } = await fetchLatestBaileysVersion();

        console.log(`📦 Baileys v${version.join('.')}`);

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'), // PAKAI INI!
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 15000,
            defaultQueryTimeoutMs: 60000,
            logger: {
                level: 'silent',
                child: () => ({ 
                    trace: () => {}, 
                    debug: () => {}, 
                    info: () => {}, 
                    warn: () => {}, 
                    error: () => {} 
                })
            },
            markOnlineOnConnect: true,
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            shouldSyncHistoryMessage: () => false,
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            console.log(`📡 Status: ${connection}`);

            if (connection === 'open') {
                botStatus = 'connected';
                botNumber = sock.user.id;
                console.log(`✅ BOT CONNECTED!`);
                console.log(`📱 Nomor: ${botNumber}`);
                console.log('📨 Bot siap menerima pesan!\n');
            }

            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log(`❌ Disconnected (${statusCode})`);
                botStatus = 'disconnected';
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    console.log('⚠️ Session invalid, hapus session...');
                    if (fs.existsSync(SESSION_PATH)) {
                        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
                    }
                    console.log('🔄 Restart bot...');
                    setTimeout(startBot, 5000);
                } else {
                    console.log(`🔄 Reconnect dalam 5s...`);
                    setTimeout(startBot, 5000);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
                const msg = messages[0];
                if (!msg.message || msg.key.fromMe) return;

                let text = '';
                if (msg.message.conversation) {
                    text = msg.message.conversation;
                } else if (msg.message.extendedTextMessage) {
                    text = msg.message.extendedTextMessage.text || '';
                }

                if (!text.startsWith('!')) return;

                const args = text.slice(1).trim().split(/ +/);
                const command = args.shift()?.toLowerCase();
                if (!command) return;

                const sender = msg.key.participant || msg.key.remoteJid;
                console.log(`📨 [${command}] dari ${sender}`);

                if (command === 'ping') {
                    await sock.sendMessage(msg.key.remoteJid, { text: '🏓 Pong!' });
                } else if (command === 'info') {
                    await sock.sendMessage(msg.key.remoteJid, { 
                        text: `🤖 *Bot WhatsApp Pro*\n📱 Nomor: ${sock.user.id}\n📡 Status: Online ✅\n👨‍💻 Owner: ${OWNER_NUMBER}` 
                    });
                } else if (command === 'menu') {
                    await sock.sendMessage(msg.key.remoteJid, { 
                        text: `📋 *MENU BOT*\n\n!ping - Test koneksi\n!info - Info bot\n!menu - Menu ini` 
                    });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { 
                        text: `❌ Command *${command}* tidak dikenal!\nKetik *!menu* untuk lihat daftar command.` 
                    });
                }
            } catch (error) {
                console.error('❌ Error:', error.message);
            }
        });

        return sock;

    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        setTimeout(startBot, 5000);
    }
}

// ==========================================
// API
// ==========================================
app.post('/api/pair', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ success: false, error: 'Nomor HP wajib diisi!' });
        }

        const cleanNumber = phoneNumber.replace(/\D/g, '');
        console.log(`📱 Request pairing untuk: ${cleanNumber}`);

        if (!sock) {
            await startBot();
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (!sock || !sock.authState) {
            return res.status(500).json({ success: false, error: 'Bot belum siap, coba lagi' });
        }

        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(cleanNumber);
            pairingCode = code;
            
            console.log(`✅ PAIRING CODE: ${code}`);
            
            return res.json({
                success: true,
                pairingCode: code,
                phoneNumber: cleanNumber,
                message: 'Masukkan kode ini di WhatsApp! Kode valid 60 detik!'
            });
        } else {
            return res.json({
                success: true,
                message: 'Bot sudah terhubung!',
                botNumber: botNumber
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json({
        status: botStatus,
        botNumber: botNumber || null,
        pairingCode: pairingCode || null
    });
});

app.post('/api/reset', async (req, res) => {
    try {
        if (sock) {
            await sock.end();
            sock = null;
        }
        botStatus = 'disconnected';
        pairingCode = null;
        if (fs.existsSync(SESSION_PATH)) {
            fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        }
        console.log('🔄 Bot direset!');
        setTimeout(startBot, 3000);
        res.json({ success: true, message: 'Bot direset!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// START
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server running on port ${PORT}`);
    console.log(`🔗 Buka: https://tes-production-3a99.up.railway.app`);
    startBot();
});

process.on('SIGINT', () => {
    console.log('\n👋 Server dimatikan...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Server dimatikan...');
    process.exit(0);
});