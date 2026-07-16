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
// ===== GAUSAH TENTUIN PORT! =====
// const PORT = 3000; ← HAPUS!
// const PORT = 8080; ← HAPUS!

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const OWNER_NUMBER = '6281284406156'; // GANTI DENGAN NOMOR LU!
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
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            console.log(`📡 Status: ${connection}`);

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
                console.log(`❌ Disconnected (${statusCode})`);
                botStatus = 'disconnected';
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    console.log('⚠️ Session invalid, hapus session...');
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
                else if (msg.message.imageMessage) text = msg.message.imageMessage.caption || '';
                else if (msg.message.videoMessage) text = msg.message.videoMessage.caption || '';

                if (!text.startsWith('!')) return;

                const args = text.slice(1).trim().split(/ +/);
                const command = args.shift()?.toLowerCase();
                if (!command) return;

                const sender = msg.key.participant || msg.key.remoteJid;
                const chatId = msg.key.remoteJid;
                const isGroup = chatId.endsWith('@g.us');

                console.log(`📨 [${command}] dari ${sender}`);

                if (command === 'ping') {
                    const start = Date.now();
                    await sock.sendMessage(chatId, { text: '🏓 Pong!' });
                    const latency = Date.now() - start;
                    await sock.sendMessage(chatId, { 
                        text: `✅ Online!\n⏱️ ${latency}ms` 
                    });
                }

                else if (command === 'info') {
                    await sock.sendMessage(chatId, { 
                        text: `🤖 *Bot WhatsApp Pro*\n\n` +
                            `📱 Nomor: ${sock.user.id}\n` +
                            `📡 Status: Online ✅\n` +
                            `⏱️ Uptime: ${Math.floor(process.uptime())} detik\n` +
                            `👨‍💻 Owner: ${OWNER_NUMBER}\n\n` +
                            `📋 *Commands:*\n` +
                            `!ping - Test bot\n` +
                            `!info - Info bot\n` +
                            `!menu - Menu\n` +
                            `!owner - Info owner\n` +
                            `!hidetag - Mention semua member (grup)\n` +
                            `!kick @user - Kick member (grup)\n` +
                            `!add @user - Tambah member (grup)\n` +
                            `!setdesc [teks] - Ganti deskripsi grup\n` +
                            `!setname [nama] - Ganti nama grup\n` +
                            `!tagall - Mention semua member\n` +
                            `!leave - Keluar dari grup` 
                    });
                }

                else if (command === 'menu') {
                    await sock.sendMessage(chatId, { 
                        text: `📋 *MENU BOT*\n\n` +
                            `🔹 *Command Umum:*\n` +
                            `!ping - Test koneksi\n` +
                            `!info - Info bot\n` +
                            `!menu - Menu ini\n` +
                            `!owner - Info owner\n\n` +
                            `🔸 *Command Grup (Admin):*\n` +
                            `!hidetag - Mention semua member\n` +
                            `!tagall - Mention semua member\n` +
                            `!kick @user - Kick member\n` +
                            `!add @user - Tambah member\n` +
                            `!setdesc [teks] - Ganti deskripsi\n` +
                            `!setname [nama] - Ganti nama grup\n` +
                            `!leave - Keluar dari grup\n\n` +
                            `_Made with ❤️ by WhatsApp Bot Pro_` 
                    });
                }

                else if (command === 'owner') {
                    await sock.sendMessage(chatId, { 
                        text: `👨‍💻 *Owner Bot*\n\n` +
                            `📱 Nomor: ${OWNER_NUMBER}\n` +
                            `💬 Hubungi untuk lapor bug atau request fitur.\n\n` +
                            `_Made with ❤️_` 
                    });
                }

                else if (command === 'hidetag' || command === 'tagall') {
                    if (!isGroup) {
                        return sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                    }

                    const groupMetadata = await sock.groupMetadata(chatId);
                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    const isBotAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

                    if (!isBotAdmin) {
                        return sock.sendMessage(chatId, { text: '❌ Bot harus jadi ADMIN dulu!' });
                    }

                    const mentions = groupMetadata.participants.map(p => p.id);
                    const textMsg = args.join(' ') || '👥 *HIDETAG*\n\nSemua member telah dipanggil! 📢';
                    
                    await sock.sendMessage(chatId, { 
                        text: textMsg, 
                        mentions: mentions 
                    });
                    console.log(`✅ Hidetag di grup ${groupMetadata.subject}`);
                }

                else if (command === 'kick') {
                    if (!isGroup) {
                        return sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                    }

                    const groupMetadata = await sock.groupMetadata(chatId);
                    const senderInfo = groupMetadata.participants.find(p => p.id === sender);
                    
                    if (!senderInfo?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Hanya ADMIN grup yang bisa pakai command ini!' });
                    }

                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    const isBotAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

                    if (!isBotAdmin) {
                        return sock.sendMessage(chatId, { text: '❌ Bot harus jadi ADMIN dulu!' });
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
                        return sock.sendMessage(chatId, { text: '❌ Tag atau reply user yang mau di-kick!\nCara: !kick @user' });
                    }

                    if (target === sender) {
                        return sock.sendMessage(chatId, { text: '❌ Gak bisa kick diri sendiri!' });
                    }

                    if (target === OWNER_NUMBER + '@s.whatsapp.net') {
                        return sock.sendMessage(chatId, { text: '❌ Gak bisa kick owner bot!' });
                    }

                    await sock.groupParticipantsUpdate(chatId, [target], 'remove');
                    await sock.sendMessage(chatId, {
                        text: `👢 *KICKED!*\n\n@${target.split('@')[0]} telah ditendang!`,
                        mentions: [target]
                    });
                    console.log(`✅ Kick @${target.split('@')[0]} dari ${groupMetadata.subject}`);
                }

                else if (command === 'add') {
                    if (!isGroup) {
                        return sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                    }

                    const groupMetadata = await sock.groupMetadata(chatId);
                    const senderInfo = groupMetadata.participants.find(p => p.id === sender);
                    
                    if (!senderInfo?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Hanya ADMIN grup yang bisa pakai command ini!' });
                    }

                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    const isBotAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

                    if (!isBotAdmin) {
                        return sock.sendMessage(chatId, { text: '❌ Bot harus jadi ADMIN dulu!' });
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
                        return sock.sendMessage(chatId, { text: '❌ Tag user yang mau di-add!\nCara: !add @user' });
                    }

                    await sock.groupParticipantsUpdate(chatId, [target], 'add');
                    await sock.sendMessage(chatId, {
                        text: `✅ *ADDED!*\n\n@${target.split('@')[0]} telah ditambahkan ke grup!`,
                        mentions: [target]
                    });
                    console.log(`✅ Add @${target.split('@')[0]} ke ${groupMetadata.subject}`);
                }

                else if (command === 'setdesc') {
                    if (!isGroup) {
                        return sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                    }

                    const groupMetadata = await sock.groupMetadata(chatId);
                    const senderInfo = groupMetadata.participants.find(p => p.id === sender);
                    
                    if (!senderInfo?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Hanya ADMIN grup yang bisa pakai command ini!' });
                    }

                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    const isBotAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

                    if (!isBotAdmin) {
                        return sock.sendMessage(chatId, { text: '❌ Bot harus jadi ADMIN dulu!' });
                    }

                    const newDesc = args.join(' ');
                    if (!newDesc) {
                        return sock.sendMessage(chatId, { text: '❌ Masukkan deskripsi baru!\nCara: !setdesc Deskripsi baru' });
                    }

                    await sock.groupUpdateDescription(chatId, newDesc);
                    await sock.sendMessage(chatId, { 
                        text: `✅ *DESKRIPSI DIUBAH!*\n\n📝 Deskripsi baru: ${newDesc}` 
                    });
                    console.log(`✅ Deskripsi grup ${groupMetadata.subject} diubah`);
                }

                else if (command === 'setname') {
                    if (!isGroup) {
                        return sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                    }

                    const groupMetadata = await sock.groupMetadata(chatId);
                    const senderInfo = groupMetadata.participants.find(p => p.id === sender);
                    
                    if (!senderInfo?.admin) {
                        return sock.sendMessage(chatId, { text: '❌ Hanya ADMIN grup yang bisa pakai command ini!' });
                    }

                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    const isBotAdmin = groupMetadata.participants.find(p => p.id === botId)?.admin;

                    if (!isBotAdmin) {
                        return sock.sendMessage(chatId, { text: '❌ Bot harus jadi ADMIN dulu!' });
                    }

                    const newName = args.join(' ');
                    if (!newName) {
                        return sock.sendMessage(chatId, { text: '❌ Masukkan nama baru!\nCara: !setname Nama grup baru' });
                    }

                    await sock.groupUpdateSubject(chatId, newName);
                    await sock.sendMessage(chatId, { 
                        text: `✅ *NAMA GRUP DIUBAH!*\n\n📛 Nama baru: ${newName}` 
                    });
                    console.log(`✅ Nama grup diubah menjadi ${newName}`);
                }

                else if (command === 'leave') {
                    if (!isGroup) {
                        return sock.sendMessage(chatId, { text: '❌ Command ini hanya bisa dipakai di GRUP!' });
                    }

                    await sock.sendMessage(chatId, { text: '👋 Bot keluar dari grup ini. Bye bye!' });
                    await sock.groupLeave(chatId);
                    console.log(`✅ Bot keluar dari grup`);
                }

                else {
                    await sock.sendMessage(chatId, { 
                        text: `❌ Command *${command}* tidak dikenal!\nKetik *!menu* untuk lihat daftar command.` 
                    });
                }

            } catch (error) {
                console.error('❌ Error processing message:', error.message);
                await sock.sendMessage(msg.key.remoteJid, { 
                    text: `❌ Error: ${error.message}` 
                });
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
        return res.status(500).json({ error: error.message });
    }
});

// ==========================================
// API: CEK STATUS
// ==========================================
app.get('/api/status', (req, res) => {
    res.json({
        status: botStatus,
        botNumber: botNumber || null,
        pairingCode: pairingCode || null
    });
});

// ==========================================
// API: RESET BOT
// ==========================================
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
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// START SERVER DENGAN RANDOM PORT!
// ==========================================
const server = app.listen(0, '0.0.0.0', () => {
    const actualPort = server.address().port;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 SERVER STARTED!`);
    console.log(`📡 Port: ${actualPort} (RANDOM!)`);
    console.log(`🔗 https://tes-production-3a99.up.railway.app`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
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