const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

// ==========================================
// MATIKAN SEMUA LOG BAILEYS YANG BERANTAKAN
// ==========================================
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
    const msg = args.join(' ');
    if (msg.includes('✅') || msg.includes('❌') || msg.includes('📱') || 
        msg.includes('🌐') || msg.includes('📡') || msg.includes('📦') ||
        msg.includes('PAIRING') || msg.includes('BOT CONNECTED')) {
        originalLog.apply(console, args);
    }
};

console.error = function(...args) {
    const msg = args.join(' ');
    if (msg.includes('❌') || msg.includes('Error') || msg.includes('Fatal')) {
        originalError.apply(console, args);
    }
};

const app = express();
app.use(express.json());
app.use(express.static('public'));

const OWNER = '6281284406156';
// ===== PORT RANDOM (0) BIAR GAK KEPAKE! =====
const PORT = 0;

let sock = null;
let pairingCode = null;

// ==========================================
// API: PAIRING
// ==========================================
app.post('/api/pair', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ error: 'Nomor HP wajib!' });
        }

        const clean = phone.replace(/\D/g, '');
        console.log('📱 Pairing untuk:', clean);

        if (fs.existsSync('./session')) {
            fs.rmSync('./session', { recursive: true, force: true });
        }
        fs.mkdirSync('./session');

        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const { version } = await fetchLatestBaileysVersion();

        console.log('📦 Baileys v' + version.join('.'));

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ['WhatsApp Bot', 'Chrome', '120.0.0.0'],
            mobile: true,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 10000,
            defaultQueryTimeoutMs: 30000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            logger: {
                level: 'silent',
                child: () => ({ trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {} })
            }
        });

        sock.ev.on('creds.update', saveCreds);
        await new Promise(r => setTimeout(r, 3000));

        const code = await sock.requestPairingCode(clean);
        pairingCode = code;
        console.log('✅ PAIRING CODE:', code);

        res.json({ success: true, code });

    } catch (e) {
        console.error('❌ Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ status: sock ? 'connected' : 'disconnected' });
});

app.post('/api/reset', async (req, res) => {
    try {
        if (sock) {
            await sock.end();
            sock = null;
        }
        if (fs.existsSync('./session')) {
            fs.rmSync('./session', { recursive: true, force: true });
        }
        pairingCode = null;
        res.json({ success: true, message: 'Bot direset!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// START BOT
// ==========================================
async function startBot() {
    try {
        if (fs.existsSync('./session')) {
            fs.rmSync('./session', { recursive: true, force: true });
        }
        fs.mkdirSync('./session');

        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ['WhatsApp Bot', 'Chrome', '120.0.0.0'],
            mobile: true,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 10000,
            defaultQueryTimeoutMs: 30000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            logger: {
                level: 'silent',
                child: () => ({ trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {} })
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log('✅ BOT CONNECTED!');
                console.log('📱 Nomor:', sock.user.id);
            }
            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    if (fs.existsSync('./session')) {
                        fs.rmSync('./session', { recursive: true, force: true });
                    }
                }
                setTimeout(startBot, 5000);
            }
        });

        // ==========================================
        // MESSAGE HANDLER (FITUR LENGKAP!)
        // ==========================================
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

                const chatId = msg.key.remoteJid;
                const isGroup = chatId.endsWith('@g.us');

                if (command === 'ping') {
                    await sock.sendMessage(chatId, { text: '🏓 Pong!' });
                } else if (command === 'info') {
                    await sock.sendMessage(chatId, {
                        text: '🤖 *Bot WhatsApp Pro*\n📱 ' + sock.user.id + '\n📡 Online ✅\n👨‍💻 Owner: ' + OWNER
                    });
                } else if (command === 'menu') {
                    await sock.sendMessage(chatId, {
                        text: '📋 *MENU BOT*\n\n!ping - Test\n!info - Info\n!menu - Menu\n!owner - Owner\n!hidetag - Tag semua (grup)\n!kick @user - Kick (grup)\n!add @user - Add (grup)\n!setdesc teks - Ganti deskripsi\n!setname nama - Ganti nama grup\n!leave - Keluar grup'
                    });
                } else if (command === 'owner') {
                    await sock.sendMessage(chatId, { text: '👨‍💻 Owner: ' + OWNER });
                } else if (command === 'hidetag' || command === 'tagall') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    const metadata = await sock.groupMetadata(chatId);
                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    if (!metadata.participants.find(p => p.id === botId)?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Bot harus ADMIN!' });
                    }
                    const mentions = metadata.participants.map(p => p.id);
                    await sock.sendMessage(chatId, { text: args.join(' ') || '👥 HIDETAG!', mentions });
                } else if (command === 'kick') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === msg.key.participant)?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                    }
                    const ctx = msg.message?.extendedTextMessage?.contextInfo;
                    const target = ctx?.mentionedJid?.[0] || ctx?.participant;
                    if (!target) return sock.sendMessage(chatId, { text: '❌ Tag user!' });
                    if (target === OWNER + '@s.whatsapp.net') {
                        return sock.sendMessage(chatId, { text: '❌ Gak bisa kick owner!' });
                    }
                    await sock.groupParticipantsUpdate(chatId, [target], 'remove');
                    await sock.sendMessage(chatId, { text: '👢 @' + target.split('@')[0] + ' di-kick!', mentions: [target] });
                } else if (command === 'add') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === msg.key.participant)?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                    }
                    const ctx = msg.message?.extendedTextMessage?.contextInfo;
                    const target = ctx?.mentionedJid?.[0] || ctx?.participant;
                    if (!target) return sock.sendMessage(chatId, { text: '❌ Tag user!' });
                    await sock.groupParticipantsUpdate(chatId, [target], 'add');
                    await sock.sendMessage(chatId, { text: '✅ @' + target.split('@')[0] + ' di-add!', mentions: [target] });
                } else if (command === 'setdesc') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === msg.key.participant)?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                    }
                    const newDesc = args.join(' ');
                    if (!newDesc) return sock.sendMessage(chatId, { text: '❌ Masukkan deskripsi!' });
                    await sock.groupUpdateDescription(chatId, newDesc);
                    await sock.sendMessage(chatId, { text: '✅ Deskripsi diubah!\n' + newDesc });
                } else if (command === 'setname') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === msg.key.participant)?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                    }
                    const newName = args.join(' ');
                    if (!newName) return sock.sendMessage(chatId, { text: '❌ Masukkan nama!' });
                    await sock.groupUpdateSubject(chatId, newName);
                    await sock.sendMessage(chatId, { text: '✅ Nama grup diubah!\n' + newName });
                } else if (command === 'leave') {
                    if (!isGroup) return sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                    await sock.sendMessage(chatId, { text: '👋 Bye!' });
                    await sock.groupLeave(chatId);
                } else {
                    await sock.sendMessage(chatId, { text: '❌ Command *' + command + '* tidak dikenal!\nKetik *!menu*' });
                }

            } catch (error) {
                // SILENT
            }
        });

    } catch (error) {
        setTimeout(startBot, 5000);
    }
}

// ==========================================
// START SERVER PAKE RANDOM PORT!
// ==========================================
const server = app.listen(PORT, '0.0.0.0', () => {
    const actualPort = server.address().port;
    console.log('🌐 SERVER STARTED!');
    console.log('📡 Port:', actualPort);
    console.log('🔗 https://' + process.env.REPL_SLUG + '.' + process.env.REPL_OWNER + '.repl.co');
    startBot();
});

// ===== KALO ERROR PORT, TETAP JALAN =====
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log('⚠️ Port sibuk, coba port lain...');
        const newServer = app.listen(0, '0.0.0.0', () => {
            console.log('🌐 Server running on port', newServer.address().port);
        });
    }
});