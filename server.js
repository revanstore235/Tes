const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const OWNER = '6281284406156';
const PORT = process.env.PORT || 3000;

let sock = null;
let pairingCode = null;

// ===== API: PAIRING =====
app.post('/api/pair', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Nomor HP wajib!' });

        const clean = phone.replace(/\D/g, '');
        console.log('📱 Pairing untuk:', clean);

        // ===== PASTIKAN SESSION BERSIH =====
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
            // ===== PAKAI BROWSER MOBILE! =====
            browser: ['WhatsApp Bot', 'Chrome', '120.0.0.0'],
            // ===== MOBILE: TRUE UNTUK PAIRING CODE =====
            mobile: true,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 10000,
            defaultQueryTimeoutMs: 30000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false
        });

        sock.ev.on('creds.update', saveCreds);

        // ===== TUNGGU SOCKET SIAP =====
        await new Promise(r => setTimeout(r, 3000));

        // ===== REQUEST PAIRING CODE =====
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
            shouldSyncHistoryMessage: () => false
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
                console.log('❌ Disconnected:', statusCode);
                setTimeout(startBot, 5000);
            }
        });

        // ===== MESSAGE HANDLER =====
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

                console.log('📨 [', command, ']');

                // ===== COMMANDS =====
                if (command === 'ping') {
                    await sock.sendMessage(chatId, { text: '🏓 Pong!' });
                } else if (command === 'info') {
                    await sock.sendMessage(chatId, {
                        text: '🤖 *Bot WhatsApp Pro*\n📱 ' + sock.user.id + '\n📡 Online ✅\n👨‍💻 Owner: ' + OWNER
                    });
                } else if (command === 'menu') {
                    await sock.sendMessage(chatId, {
                        text: '📋 *MENU BOT*\n\n' +
                            '!ping - Test\n' +
                            '!info - Info\n' +
                            '!menu - Menu\n' +
                            '!owner - Owner\n' +
                            '!hidetag - Tag semua (grup)\n' +
                            '!kick @user - Kick (grup)\n' +
                            '!add @user - Add (grup)\n' +
                            '!setdesc teks - Ganti deskripsi\n' +
                            '!setname nama - Ganti nama grup\n' +
                            '!leave - Keluar grup'
                    });
                } else if (command === 'owner') {
                    await sock.sendMessage(chatId, { text: '👨‍💻 Owner: ' + OWNER });
                } else if (command === 'hidetag' || command === 'tagall') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                        return;
                    }
                    const metadata = await sock.groupMetadata(chatId);
                    const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
                    if (!metadata.participants.find(p => p.id === botId)?.admin) {
                        await sock.sendMessage(chatId, { text: '❌ Bot harus ADMIN!' });
                        return;
                    }
                    const mentions = metadata.participants.map(p => p.id);
                    await sock.sendMessage(chatId, {
                        text: args.join(' ') || '👥 HIDETAG!',
                        mentions: mentions
                    });
                } else if (command === 'kick') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                        return;
                    }
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === sender)?.admin) {
                        await sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                        return;
                    }
                    const ctx = msg.message?.extendedTextMessage?.contextInfo;
                    const target = ctx?.mentionedJid?.[0] || ctx?.participant;
                    if (!target) {
                        await sock.sendMessage(chatId, { text: '❌ Tag user!' });
                        return;
                    }
                    if (target === OWNER + '@s.whatsapp.net') {
                        await sock.sendMessage(chatId, { text: '❌ Gak bisa kick owner!' });
                        return;
                    }
                    await sock.groupParticipantsUpdate(chatId, [target], 'remove');
                    await sock.sendMessage(chatId, {
                        text: '👢 @' + target.split('@')[0] + ' di-kick!',
                        mentions: [target]
                    });
                } else if (command === 'add') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                        return;
                    }
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === sender)?.admin) {
                        await sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                        return;
                    }
                    const ctx = msg.message?.extendedTextMessage?.contextInfo;
                    const target = ctx?.mentionedJid?.[0] || ctx?.participant;
                    if (!target) {
                        await sock.sendMessage(chatId, { text: '❌ Tag user!' });
                        return;
                    }
                    await sock.groupParticipantsUpdate(chatId, [target], 'add');
                    await sock.sendMessage(chatId, {
                        text: '✅ @' + target.split('@')[0] + ' di-add!',
                        mentions: [target]
                    });
                } else if (command === 'setdesc') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                        return;
                    }
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === sender)?.admin) {
                        await sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                        return;
                    }
                    const newDesc = args.join(' ');
                    if (!newDesc) {
                        await sock.sendMessage(chatId, { text: '❌ Masukkan deskripsi!' });
                        return;
                    }
                    await sock.groupUpdateDescription(chatId, newDesc);
                    await sock.sendMessage(chatId, { text: '✅ Deskripsi diubah!\n' + newDesc });
                } else if (command === 'setname') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                        return;
                    }
                    const metadata = await sock.groupMetadata(chatId);
                    if (!metadata.participants.find(p => p.id === sender)?.admin) {
                        await sock.sendMessage(chatId, { text: '❌ Harus ADMIN!' });
                        return;
                    }
                    const newName = args.join(' ');
                    if (!newName) {
                        await sock.sendMessage(chatId, { text: '❌ Masukkan nama!' });
                        return;
                    }
                    await sock.groupUpdateSubject(chatId, newName);
                    await sock.sendMessage(chatId, { text: '✅ Nama grup diubah!\n' + newName });
                } else if (command === 'leave') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                        return;
                    }
                    await sock.sendMessage(chatId, { text: '👋 Bye!' });
                    await sock.groupLeave(chatId);
                } else {
                    await sock.sendMessage(chatId, {
                        text: '❌ Command *' + command + '* tidak dikenal!\nKetik *!menu*'
                    });
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

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('🌐 Server running on port', PORT);
    console.log('🔗 https://' + process.env.REPL_SLUG + '.' + process.env.REPL_OWNER + '.repl.co');
    startBot();
});