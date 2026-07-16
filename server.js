const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const QRCode = require('qrcode-terminal');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const OWNER_NUMBER = '6281284406156';
const PORT = process.env.PORT || 3000;

let sock = null;
let qrCodeData = null;
let pairingCodeData = null;

app.post('/api/pair', async (req, res) => {
    try {
        const { phone, method } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, error: 'Nomor HP wajib diisi!' });
        }

        const clean = phone.replace(/\D/g, '');
        console.log('📱 Pairing untuk:', clean);
        console.log('📱 Metode:', method || 'pairing');

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
            browser: ['Baileys', 'Chrome', '120.0.0.0'],
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false
        });

        sock.ev.on('creds.update', saveCreds);

        // TUNGGU SOCKET SIAP
        await new Promise(r => setTimeout(r, 3000));

        // ===== QR CODE (CUMAN KALO METHOD QR) =====
        if (method === 'qr') {
            let qrResolve;
            const qrPromise = new Promise((resolve) => {
                qrResolve = resolve;
                sock.ev.on('connection.update', (update) => {
                    if (update.qr) {
                        qrCodeData = update.qr;
                        console.log('📱 QR CODE GENERATED!');
                        resolve(update.qr);
                    }
                });
            });

            const timeout = setTimeout(() => {
                if (qrResolve) qrResolve(null);
            }, 30000);

            const qr = await qrPromise;
            clearTimeout(timeout);

            if (qr) {
                return res.json({
                    success: true,
                    qr: qr,
                    method: 'qr'
                });
            } else {
                return res.json({
                    success: false,
                    error: 'Gagal generate QR Code, coba pairing code'
                });
            }
        }

        // ===== PAIRING CODE =====
        const code = await sock.requestPairingCode(clean);
        pairingCodeData = code;
        console.log('✅ PAIRING CODE:', code);

        return res.json({
            success: true,
            code: code,
            method: 'pairing'
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
    res.json({
        status: sock ? 'connected' : 'disconnected',
        botNumber: sock ? sock.user.id : null
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
                        text: '🤖 *Bot WhatsApp Pro*\n📱 ' + sock.user.id + '\n👨‍💻 Owner: ' + OWNER_NUMBER
                    });
                } else if (command === 'menu') {
                    await sock.sendMessage(chatId, {
                        text: '📋 *MENU BOT*\n\n!ping - Test\n!info - Info\n!menu - Menu\n!hidetag - Tag semua (grup)\n!kick @user - Kick (grup)\n!add @user - Add (grup)\n!setdesc - Ganti deskripsi\n!setname - Ganti nama grup\n!leave - Keluar grup'
                    });
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
                console.error('❌ Error:', error.message);
            }
        });

    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        setTimeout(startBot, 5000);
    }
}

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('🌐 Server running on port', PORT);
    console.log('🔗 https://' + process.env.RAILWAY_STATIC_URL || 'railway.app');
    startBot();
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log('⚠️ Port', PORT, 'sibuk, coba port lain...');
        const newServer = app.listen(0, '0.0.0.0', () => {
            console.log('🌐 Server running on port', newServer.address().port);
        });
    }
});