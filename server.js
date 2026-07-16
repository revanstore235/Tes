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

// ===== MATIKIN SEMUA LOG =====
console.log = function() {};
console.info = function() {};
console.warn = function() {};
console.debug = function() {};
console.trace = function() {};

// ===== TAPI TETAP TAMPILIN PESAN PENTING =====
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
    const msg = args.join(' ');
    if (msg.includes('✅') || msg.includes('❌') || msg.includes('📱') || msg.includes('🌐') || msg.includes('📡')) {
        originalLog.apply(console, args);
    }
};

console.error = function(...args) {
    const msg = args.join(' ');
    if (msg.includes('❌') || msg.includes('Fatal') || msg.includes('Error')) {
        originalError.apply(console, args);
    }
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const OWNER_NUMBER = '6281284406156';
const SESSION_PATH = './session';

let sock = null;
let pairingCode = null;
let botStatus = 'disconnected';
let botNumber = null;

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
            browser: ['KickBot', 'Chrome', '120.0.0.0'],
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 15000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            shouldSyncHistoryMessage: () => false,
            // ===== MATIKIN LOGGER =====
            logger: {
                level: 'silent',
                child: () => ({ 
                    trace: () => {}, 
                    debug: () => {}, 
                    info: () => {}, 
                    warn: () => {}, 
                    error: () => {} 
                })
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                botStatus = 'connected';
                botNumber = sock.user.id;
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`✅ BOT CONNECTED!`);
                console.log(`📱 Nomor: ${botNumber}`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            }

            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    if (fs.existsSync(SESSION_PATH)) {
                        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
                    }
                    setTimeout(startBot, 5000);
                } else {
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
                if (msg.message.conversation) text = msg.message.conversation;
                else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text || '';

                if (!text.startsWith('!')) return;

                const args = text.slice(1).trim().split(/ +/);
                const command = args.shift()?.toLowerCase();
                if (!command) return;

                const sender = msg.key.participant || msg.key.remoteJid;
                const chatId = msg.key.remoteJid;
                const isGroup = chatId.endsWith('@g.us');

                if (command === 'ping') {
                    await sock.sendMessage(chatId, { text: '🏓 Pong!' });
                } else if (command === 'info') {
                    await sock.sendMessage(chatId, { 
                        text: `🤖 *Bot WhatsApp Pro*\n📱 Nomor: ${sock.user.id}\n📡 Status: Online ✅\n👨‍💻 Owner: ${OWNER_NUMBER}` 
                    });
                } else if (command === 'menu') {
                    await sock.sendMessage(chatId, { 
                        text: `📋 *MENU BOT*\n\n!ping - Test\n!info - Info\n!menu - Menu\n!hidetag - Tag semua\n!kick @user - Kick\n!add @user - Add\n!setdesc - Ganti desk\n!setname - Ganti nama\n!leave - Keluar grup` 
                    });
                } else if (command === 'hidetag' || command === 'tagall') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    const metadata = await sock.groupMetadata(chatId);
                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    if (!metadata.participants.find(p => p.id === botId)?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Bot harus ADMIN!' });
                    }
                    const mentions = metadata.participants.map(p => p.id);
                    await sock.sendMessage(chatId, { 
                        text: args.join(' ') || '👥 HIDETAG!', 
                        mentions 
                    });
                } else if (command === 'kick') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === sender)?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                    }
                    const ctx = msg.message?.extendedTextMessage?.contextInfo;
                    const target = ctx?.mentionedJid?.[0] || ctx?.participant;
                    if (!target) return sock.sendMessage(chatId, { text: '❌ Tag user!' });
                    if (target === OWNER_NUMBER + '@s.whatsapp.net') {
                        return sock.sendMessage(chatId, { text: '❌ Gak bisa kick owner!' });
                    }
                    await sock.groupParticipantsUpdate(chatId, [target], 'remove');
                    await sock.sendMessage(chatId, { text: `👢 @${target.split('@')[0]} di-kick!`, mentions: [target] });
                } else if (command === 'add') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === sender)?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                    }
                    const ctx = msg.message?.extendedTextMessage?.contextInfo;
                    const target = ctx?.mentionedJid?.[0] || ctx?.participant;
                    if (!target) return sock.sendMessage(chatId, { text: '❌ Tag user!' });
                    await sock.groupParticipantsUpdate(chatId, [target], 'add');
                    await sock.sendMessage(chatId, { text: `✅ @${target.split('@')[0]} di-add!`, mentions: [target] });
                } else if (command === 'setdesc') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === sender)?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                    }
                    const newDesc = args.join(' ');
                    if (!newDesc) return sock.sendMessage(chatId, { text: '❌ Masukkan deskripsi!' });
                    await sock.groupUpdateDescription(chatId, newDesc);
                    await sock.sendMessage(chatId, { text: `✅ Deskripsi diubah!\n${newDesc}` });
                } else if (command === 'setname') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === sender)?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                    }
                    const newName = args.join(' ');
                    if (!newName) return sock.sendMessage(chatId, { text: '❌ Masukkan nama!' });
                    await sock.groupUpdateSubject(chatId, newName);
                    await sock.sendMessage(chatId, { text: `✅ Nama grup diubah!\n${newName}` });
                } else if (command === 'leave') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    await sock.sendMessage(chatId, { text: '👋 Bye!' });
                    await sock.groupLeave(chatId);
                } else {
                    await sock.sendMessage(chatId, { text: `❌ Command *${command}* tidak dikenal!\nKetik *!menu*` });
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

// ===== API =====
app.post('/api/pair', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Nomor HP wajib diisi!' });
        }

        const cleanNumber = phoneNumber.replace(/\D/g, '');
        console.log(`📱 Request pairing untuk: ${cleanNumber}`);

        if (!sock) {
            await startBot();
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (!sock || !sock.authState) {
            return res.status(500).json({ error: 'Bot belum siap, coba lagi' });
        }

        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(cleanNumber);
            pairingCode = code;
            console.log(`✅ PAIRING CODE: ${code}`);
            return res.json({
                success: true,
                pairingCode: code,
                phoneNumber: cleanNumber
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
        return res.status(500).json({ error: error.message });
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
        setTimeout(startBot, 3000);
        res.json({ success: true, message: 'Bot direset!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== START =====
const server = app.listen(0, '0.0.0.0', () => {
    const actualPort = server.address().port;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 SERVER STARTED!`);
    console.log(`📡 Port: ${actualPort}`);
    console.log(`🔗 https://tes-production-3a99.up.railway.app`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    startBot();
});

process.on('SIGINT', () => {
    process.exit(0);
});

process.on('SIGTERM', () => {
    process.exit(0);
});