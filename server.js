const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const OWNER = '6281284406156';

let sock = null;
let pairingCode = null;

// ==========================================
// HTML WEB + JS + CSS (SATU FILE!)
// ==========================================
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🤖 WhatsApp Bot</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: Arial, sans-serif;
                background: linear-gradient(135deg, #667eea, #764ba2);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
            }
            .card {
                background: white;
                border-radius: 20px;
                padding: 40px;
                max-width: 450px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            h1 { text-align: center; color: #333; margin-bottom: 5px; }
            .sub { text-align: center; color: #888; margin-bottom: 25px; font-size: 14px; }
            .input-group { display: flex; gap: 10px; margin-bottom: 20px; }
            .input-group input {
                flex: 1;
                padding: 14px;
                border: 2px solid #e0e0e0;
                border-radius: 12px;
                font-size: 16px;
            }
            .input-group input:focus { outline: none; border-color: #667eea; }
            .input-group button {
                padding: 14px 24px;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
            }
            .input-group button:disabled { opacity: 0.6; }
            #result {
                background: #f5f5f5;
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                min-height: 80px;
                margin-bottom: 20px;
            }
            .code {
                font-size: 28px;
                font-weight: bold;
                color: #28a745;
                letter-spacing: 4px;
                background: white;
                padding: 10px;
                border-radius: 8px;
                margin: 10px 0;
                border: 2px dashed #28a745;
            }
            .status {
                text-align: center;
                color: #666;
                font-size: 14px;
            }
            .status.online { color: #28a745; }
            .status.offline { color: #dc3545; }
            .menu-box {
                background: #f0f0f0;
                border-radius: 12px;
                padding: 15px;
                margin-top: 15px;
                font-size: 13px;
                max-height: 200px;
                overflow-y: auto;
            }
            .menu-box b { color: #667eea; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>🤖 WhatsApp Bot</h1>
            <p class="sub">Masukkan nomor HP untuk pairing</p>

            <div class="input-group">
                <input type="text" id="phone" placeholder="6281234567890" maxlength="15">
                <button id="btn" onclick="pairing()">🔑 Get Code</button>
            </div>

            <div id="result">
                <div style="color:#888;">Masukkan nomor HP</div>
            </div>

            <div class="status" id="status">⏳ Menunggu...</div>

            <div class="menu-box">
                <b>📋 MENU BOT</b><br>
                !ping - Test bot<br>
                !info - Info bot<br>
                !menu - Menu ini<br>
                !owner - Info owner<br>
                !hidetag - Mention semua (grup)<br>
                !kick @user - Kick (grup)<br>
                !add @user - Add (grup)<br>
                !setdesc teks - Ganti deskripsi<br>
                !setname nama - Ganti nama grup<br>
                !leave - Keluar grup
            </div>
        </div>

        <script>
            async function pairing() {
                const phone = document.getElementById('phone').value.trim();
                if (!phone) return alert('Masukkan nomor HP!');
                if (phone.length < 10) return alert('Nomor tidak valid!');

                const btn = document.getElementById('btn');
                btn.disabled = true;
                btn.textContent = '⏳ Loading...';

                const result = document.getElementById('result');

                try {
                    const res = await fetch('/api/pair', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone })
                    });
                    const data = await res.json();

                    if (data.success && data.code) {
                        result.innerHTML = '<div class="code">' + data.code + '</div><div style="color:#666;">Kode valid 60 detik!</div>';
                        document.getElementById('status').textContent = '🟢 Kode siap!';
                        document.getElementById('status').className = 'status online';
                    } else {
                        result.innerHTML = '<div style="color:#dc3545;">❌ ' + (data.error || 'Gagal!') + '</div>';
                    }
                } catch (e) {
                    result.innerHTML = '<div style="color:#dc3545;">❌ Error: ' + e.message + '</div>';
                }

                btn.disabled = false;
                btn.textContent = '🔑 Get Code';
            }

            document.getElementById('phone').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') pairing();
            });
            document.getElementById('phone').addEventListener('input', function() {
                this.value = this.value.replace(/\\D/g, '');
            });

            async function checkStatus() {
                try {
                    const res = await fetch('/api/status');
                    const data = await res.json();
                    const el = document.getElementById('status');
                    if (data.status === 'connected') {
                        el.textContent = '🟢 Online';
                        el.className = 'status online';
                    } else {
                        el.textContent = '🔴 Offline';
                        el.className = 'status offline';
                    }
                } catch(e) {}
            }
            setInterval(checkStatus, 5000);
            checkStatus();
        </script>
    </body>
    </html>
    `);
});

// ==========================================
// API: PAIRING CODE
// ==========================================
app.post('/api/pair', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Nomor HP wajib!' });

        const clean = phone.replace(/\D/g, '');
        console.log('📱 Pairing:', clean);

        if (!sock) {
            const { state, saveCreds } = await useMultiFileAuthState('./session');
            const { version } = await fetchLatestBaileysVersion();
            sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                browser: ['Chrome', 'Windows', '120.0.0.0'],
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 15000,
                markOnlineOnConnect: true
            });
            sock.ev.on('creds.update', saveCreds);
            await new Promise(r => setTimeout(r, 3000));
        }

        const code = await sock.requestPairingCode(clean);
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
// BOT MESSAGE HANDLER (FITUR LENGKAP!)
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
            browser: ['Chrome', 'Windows', '120.0.0.0'],
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 15000,
            markOnlineOnConnect: true
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

        // ==========================================
        // MESSAGE HANDLER (SEMUA FITUR!)
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

                const sender = msg.key.participant || msg.key.remoteJid;
                const chatId = msg.key.remoteJid;
                const isGroup = chatId.endsWith('@g.us');

                console.log('📨 [', command, '] dari', sender);

                // ===== 1. PING =====
                if (command === 'ping') {
                    await sock.sendMessage(chatId, { text: '🏓 Pong!' });
                }

                // ===== 2. INFO =====
                else if (command === 'info') {
                    await sock.sendMessage(chatId, {
                        text: '🤖 *Bot WhatsApp Pro*\n📱 ' + sock.user.id + '\n📡 Online ✅\n👨‍💻 Owner: ' + OWNER
                    });
                }

                // ===== 3. MENU =====
                else if (command === 'menu') {
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
                }

                // ===== 4. OWNER =====
                else if (command === 'owner') {
                    await sock.sendMessage(chatId, { text: '👨‍💻 Owner: ' + OWNER });
                }

                // ===== 5. HIDETAG / TAGALL =====
                else if (command === 'hidetag' || command === 'tagall') {
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
                }

                // ===== 6. KICK =====
                else if (command === 'kick') {
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
                }

                // ===== 7. ADD =====
                else if (command === 'add') {
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
                }

                // ===== 8. SETDESC =====
                else if (command === 'setdesc') {
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
                }

                // ===== 9. SETNAME =====
                else if (command === 'setname') {
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
                }

                // ===== 10. LEAVE =====
                else if (command === 'leave') {
                    if (!isGroup) {
                        await sock.sendMessage(chatId, { text: '❌ Hanya di GRUP!' });
                        return;
                    }
                    await sock.sendMessage(chatId, { text: '👋 Bye!' });
                    await sock.groupLeave(chatId);
                }

                // ===== DEFAULT =====
                else {
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
// START SERVER & BOT
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('🌐 Server running on port', PORT);
    console.log('🔗 https://' + process.env.REPL_SLUG + '.' + process.env.REPL_OWNER + '.repl.co');
    startBot();
});