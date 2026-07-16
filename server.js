const express = require('express');
const cors = require('cors');
const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

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
        }
        fs.mkdirSync(SESSION_PATH, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
        const { version } = await fetchLatestBaileysVersion();

        console.log('📦 Baileys v' + version.join('.'));

        sock = makeWASocket({
            version: version,
            auth: state,
            printQRInTerminal: false,
            browser: ['KickBot', 'Chrome', '120.0.0.0'],
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 15000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            shouldSyncHistoryMessage: function() { return false; }
        });

        sock.ev.on('connection.update', async (update) => {
            const connection = update.connection;
            const lastDisconnect = update.lastDisconnect;

            if (connection === 'open') {
                botStatus = 'connected';
                botNumber = sock.user.id;
                console.log('✅ BOT CONNECTED!');
                console.log('📱 Nomor: ' + botNumber);
            }

            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log('❌ Disconnected: ' + statusCode);
                botStatus = 'disconnected';
                
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

                console.log('📨 [ ' + command + ' ] dari ' + sender);

                // ==========================================
                // 1. PING
                // ==========================================
                if (command === 'ping') {
                    await sock.sendMessage(chatId, { text: '🏓 Pong!' });
                }

                // ==========================================
                // 2. INFO
                // ==========================================
                else if (command === 'info') {
                    await sock.sendMessage(chatId, { 
                        text: '🤖 *Bot WhatsApp Pro*\n\n' +
                            '📱 Nomor: ' + sock.user.id + '\n' +
                            '📡 Status: Online ✅\n' +
                            '👨‍💻 Owner: ' + OWNER_NUMBER + '\n\n' +
                            '📋 *Commands:*\n' +
                            '!ping - Test bot\n' +
                            '!info - Info bot\n' +
                            '!menu - Menu\n' +
                            '!owner - Info owner\n' +
                            '!hidetag - Mention semua member (grup)\n' +
                            '!kick @user - Kick member (grup)\n' +
                            '!add @user - Tambah member (grup)\n' +
                            '!setdesc [teks] - Ganti deskripsi grup\n' +
                            '!setname [nama] - Ganti nama grup\n' +
                            '!tagall - Mention semua member\n' +
                            '!leave - Keluar dari grup' 
                    });
                }

                // ==========================================
                // 3. MENU
                // ==========================================
                else if (command === 'menu') {
                    await sock.sendMessage(chatId, { 
                        text: '📋 *MENU BOT*\n\n' +
                            '🔹 *Command Umum:*\n' +
                            '!ping - Test koneksi\n' +
                            '!info - Info bot\n' +
                            '!menu - Menu ini\n' +
                            '!owner - Info owner\n\n' +
                            '🔸 *Command Grup (Admin):*\n' +
                            '!hidetag - Mention semua member\n' +
                            '!tagall - Mention semua member\n' +
                            '!kick @user - Kick member\n' +
                            '!add @user - Tambah member\n' +
                            '!setdesc [teks] - Ganti deskripsi\n' +
                            '!setname [nama] - Ganti nama grup\n' +
                            '!leave - Keluar dari grup\n\n' +
                            '_Made with ❤️ by WhatsApp Bot Pro_' 
                    });
                }

                // ==========================================
                // 4. OWNER
                // ==========================================
                else if (command === 'owner') {
                    await sock.sendMessage(chatId, { 
                        text: '👨‍💻 *Owner Bot*\n\n' +
                            '📱 Nomor: ' + OWNER_NUMBER + '\n' +
                            '💬 Hubungi untuk lapor bug atau request fitur.' 
                    });
                }

                // ==========================================
                // 5. HIDETAG / TAGALL
                // ==========================================
                else if (command === 'hidetag' || command === 'tagall') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                        return;
                    }

                    const groupMetadata = await sock.groupMetadata(chatId);
                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    const isBotAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

                    if (!isBotAdmin) {
                        await sock.sendMessage(chatId, { text: '❌ Bot harus jadi ADMIN dulu!' });
                        return;
                    }

                    const mentions = groupMetadata.participants.map(p => p.id);
                    const textMsg = args.join(' ') || '👥 *HIDETAG*\n\nSemua member telah dipanggil! 📢';
                    
                    await sock.sendMessage(chatId, { 
                        text: textMsg, 
                        mentions: mentions 
                    });
                    console.log('✅ Hidetag di grup ' + groupMetadata.subject);
                }

                // ==========================================
                // 6. KICK
                // ==========================================
                else if (command === 'kick') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                        return;
                    }

                    const groupMetadata = await sock.groupMetadata(chatId);
                    const senderInfo = groupMetadata.participants.find(p => p.id === sender);
                    
                    if (!senderInfo?.admin) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya ADMIN grup yang bisa pakai command ini!' });
                        return;
                    }

                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    const isBotAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

                    if (!isBotAdmin) {
                        await sock.sendMessage(chatId, { text: '❌ Bot harus jadi ADMIN dulu!' });
                        return;
                    }

                    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                    const mentioned = contextInfo?.mentionedJid || [];
                    let target;

                    if (mentioned.length > 0) {
                        target = mentioned[0];
                    } else if (contextInfo?.quotedMessage) {
                        target = contextInfo.participant;
                    }

                    if (!target) {
                        await sock.sendMessage(chatId, { text: '❌ Tag atau reply user yang mau di-kick!\nCara: !kick @user' });
                        return;
                    }

                    if (target === sender) {
                        await sock.sendMessage(chatId, { text: '❌ Gak bisa kick diri sendiri!' });
                        return;
                    }

                    if (target === OWNER_NUMBER + '@s.whatsapp.net') {
                        await sock.sendMessage(chatId, { text: '❌ Gak bisa kick owner bot!' });
                        return;
                    }

                    await sock.groupParticipantsUpdate(chatId, [target], 'remove');
                    await sock.sendMessage(chatId, {
                        text: '👢 *KICKED!*\n\n@' + target.split('@')[0] + ' telah ditendang!',
                        mentions: [target]
                    });
                    console.log('✅ Kick @' + target.split('@')[0] + ' dari ' + groupMetadata.subject);
                }

                // ==========================================
                // 7. ADD
                // ==========================================
                else if (command === 'add') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                        return;
                    }

                    const groupMetadata = await sock.groupMetadata(chatId);
                    const senderInfo = groupMetadata.participants.find(p => p.id === sender);
                    
                    if (!senderInfo?.admin) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya ADMIN grup yang bisa pakai command ini!' });
                        return;
                    }

                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    const isBotAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

                    if (!isBotAdmin) {
                        await sock.sendMessage(chatId, { text: '❌ Bot harus jadi ADMIN dulu!' });
                        return;
                    }

                    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                    const mentioned = contextInfo?.mentionedJid || [];
                    let target;

                    if (mentioned.length > 0) {
                        target = mentioned[0];
                    } else if (contextInfo?.quotedMessage) {
                        target = contextInfo.participant;
                    }

                    if (!target) {
                        await sock.sendMessage(chatId, { text: '❌ Tag user yang mau di-add!\nCara: !add @user' });
                        return;
                    }

                    await sock.groupParticipantsUpdate(chatId, [target], 'add');
                    await sock.sendMessage(chatId, {
                        text: '✅ *ADDED!*\n\n@' + target.split('@')[0] + ' telah ditambahkan ke grup!',
                        mentions: [target]
                    });
                    console.log('✅ Add @' + target.split('@')[0] + ' ke ' + groupMetadata.subject);
                }

                // ==========================================
                // 8. SETDESC (Ganti Deskripsi Grup)
                // ==========================================
                else if (command === 'setdesc') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                        return;
                    }

                    const groupMetadata = await sock.groupMetadata(chatId);
                    const senderInfo = groupMetadata.participants.find(p => p.id === sender);
                    
                    if (!senderInfo?.admin) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya ADMIN grup yang bisa pakai command ini!' });
                        return;
                    }

                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    const isBotAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

                    if (!isBotAdmin) {
                        await sock.sendMessage(chatId, { text: '❌ Bot harus jadi ADMIN dulu!' });
                        return;
                    }

                    const newDesc = args.join(' ');
                    if (!newDesc) {
                        await sock.sendMessage(chatId, { text: '❌ Masukkan deskripsi baru!\nCara: !setdesc Deskripsi baru' });
                        return;
                    }

                    await sock.groupUpdateDescription(chatId, newDesc);
                    await sock.sendMessage(chatId, { 
                        text: '✅ *DESKRIPSI DIUBAH!*\n\n📝 Deskripsi baru: ' + newDesc 
                    });
                    console.log('✅ Deskripsi grup ' + groupMetadata.subject + ' diubah');
                }

                // ==========================================
                // 9. SETNAME (Ganti Nama Grup)
                // ==========================================
                else if (command === 'setname') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                        return;
                    }

                    const groupMetadata = await sock.groupMetadata(chatId);
                    const senderInfo = groupMetadata.participants.find(p => p.id === sender);
                    
                    if (!senderInfo?.admin) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya ADMIN grup yang bisa pakai command ini!' });
                        return;
                    }

                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    const isBotAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

                    if (!isBotAdmin) {
                        await sock.sendMessage(chatId, { text: '❌ Bot harus jadi ADMIN dulu!' });
                        return;
                    }

                    const newName = args.join(' ');
                    if (!newName) {
                        await sock.sendMessage(chatId, { text: '❌ Masukkan nama baru!\nCara: !setname Nama grup baru' });
                        return;
                    }

                    await sock.groupUpdateSubject(chatId, newName);
                    await sock.sendMessage(chatId, { 
                        text: '✅ *NAMA GRUP DIUBAH!*\n\n📛 Nama baru: ' + newName 
                    });
                    console.log('✅ Nama grup diubah menjadi ' + newName);
                }

                // ==========================================
                // 10. LEAVE (Keluar dari Grup)
                // ==========================================
                else if (command === 'leave') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                        return;
                    }

                    await sock.sendMessage(chatId, { text: '👋 Bot keluar dari grup ini. Bye bye!' });
                    await sock.groupLeave(chatId);
                    console.log('✅ Bot keluar dari grup');
                }

                // ==========================================
                // 11. DEFAULT
                // ==========================================
                else {
                    await sock.sendMessage(chatId, { 
                        text: '❌ Command *' + command + '* tidak dikenal!\nKetik *!menu* untuk lihat daftar command.' 
                    });
                }

            } catch (error) {
                console.error('❌ Error processing message:', error.message);
                try {
                    await sock.sendMessage(msg.key.remoteJid, { 
                        text: '❌ Error: ' + error.message 
                    });
                } catch (e) {}
            }
        });

        return sock;

    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        setTimeout(startBot, 5000);
    }
}

// ==========================================
// API: PAIRING CODE
// ==========================================
app.post('/api/pair', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Nomor HP wajib diisi!' });
        }

        const cleanNumber = phoneNumber.replace(/\D/g, '');
        console.log('📱 Pairing untuk: ' + cleanNumber);

        if (!sock) {
            await startBot();
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (!sock || !sock.authState) {
            return res.status(500).json({ error: 'Bot belum siap' });
        }

        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(cleanNumber);
            pairingCode = code;
            console.log('✅ PAIRING CODE: ' + code);
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

// ==========================================
// START SERVER
// ==========================================
const server = app.listen(0, '0.0.0.0', function() {
    const port = server.address().port;
    console.log('🌐 SERVER STARTED!');
    console.log('📡 Port: ' + port);
    console.log('🔗 https://tes-production-3a99.up.railway.app');
    startBot();
});

process.on('SIGINT', function() { process.exit(0); });
process.on('SIGTERM', function() { process.exit(0); });