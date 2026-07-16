const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const { setting } = require('./setting.js');
const { hidetag, kick, info, ping } = require('./handler.js');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startBot() {
    try {
        if (!fs.existsSync(setting.sessionPath)) {
            fs.mkdirSync(setting.sessionPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(setting.sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🤖 ${setting.botName} v${setting.version}`);
        console.log(`📦 Baileys v${version.join('.')}`);
        console.log(`👨‍💻 Owner: ${setting.ownerNumber.split('@')[0]}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // ✅ FIX: Ganti Browsers.windows dengan Browsers.macOS
        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'), // ✅ FIXED!
            markOnlineOnConnect: true,
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            shouldSyncHistoryMessage: () => false,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 60000
        });

        await sleep(3000);

        if (!sock.authState.creds.registered) {
            console.log('📱 Meminta Pairing Code...\n');
            try {
                const phoneNumber = setting.ownerNumber.split('@')[0];
                console.log(`📞 Nomor Bot: ${phoneNumber}`);
                const code = await sock.requestPairingCode(phoneNumber);
                console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`✅ PAIRING CODE: *${code}*`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('\n📱 CARA PAIRING:');
                console.log('1️⃣ Buka WhatsApp di HP');
                console.log('2️⃣ Tap ⋮ (3 titik) > Perangkat Tertaut');
                console.log('3️⃣ Tap "Tautkan Perangkat"');
                console.log('4️⃣ Pilih "Tautkan dengan Nomor Telepon"');
                console.log(`5️⃣ Masukkan kode: *${code}*`);
                console.log('\n⏳ Tunggu koneksi...\n');
            } catch (pairingError) {
                console.error('❌ Gagal mendapatkan pairing code:', pairingError.message);
                await sleep(5000);
                process.exit(1);
            }
        } else {
            console.log('✅ Session ditemukan! Menghubungkan...\n');
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`✅ BOT CONNECTED!`);
                console.log(`📱 Nomor Bot: ${sock.user.id}`);
                console.log(`👨‍💻 Owner: ${setting.ownerNumber.split('@')[0]}`);
                console.log(`📝 Prefix: "${setting.prefix}"`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                console.log('📨 Bot siap menerima pesan!\n');
            }
            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log(`❌ Disconnected (${statusCode})`);
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    console.log('⚠️ Session invalid, hapus session...');
                    if (fs.existsSync(setting.sessionPath)) {
                        fs.rmSync(setting.sessionPath, { recursive: true, force: true });
                    }
                    await sleep(3000);
                    process.exit(1);
                } else {
                    console.log(`🔄 Reconnect dalam ${setting.reconnectDelay / 1000}s...`);
                    await sleep(setting.reconnectDelay);
                    startBot();
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
                } else if (msg.message.imageMessage) {
                    text = msg.message.imageMessage.caption || '';
                } else if (msg.message.videoMessage) {
                    text = msg.message.videoMessage.caption || '';
                }
                if (!text.startsWith(setting.prefix)) return;
                const args = text.slice(setting.prefix.length).trim().split(/ +/);
                const command = args.shift()?.toLowerCase();
                if (!command) return;
                const sender = msg.key.participant || msg.key.remoteJid;
                console.log(`📨 [${command}] dari ${sender.split('@')[0]}`);
                switch (command) {
                    case 'hidetag':
                    case 'ht':
                        await hidetag(sock, msg, args);
                        break;
                    case 'kick':
                        await kick(sock, msg, args);
                        break;
                    case 'info':
                    case 'dev':
                        await info(sock, msg);
                        break;
                    case 'ping':
                        await ping(sock, msg);
                        break;
                    case 'menu':
                        const menuText = `📋 *MENU ${setting.botName}*\n\n` +
                            `${setting.prefix}hidetag [teks] - Mention semua member\n` +
                            `${setting.prefix}kick @user - Kick member (admin)\n` +
                            `${setting.prefix}info - Info bot\n` +
                            `${setting.prefix}ping - Test bot\n` +
                            `${setting.prefix}menu - Tampilkan menu`;
                        await sock.sendMessage(msg.key.remoteJid, { text: menuText });
                        break;
                    default:
                        await sock.sendMessage(msg.key.remoteJid, { 
                            text: `❌ Command *${command}* tidak dikenal!\nKetik *${setting.prefix}menu* untuk daftar command.`
                        });
                        break;
                }
            } catch (error) {
                console.error('❌ Error processing message:', error.message);
            }
        });

        return sock;
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        await sleep(5000);
        startBot();
    }
}

console.log('🚀 Starting WhatsApp Bot...\n');
startBot().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n👋 Bot dimatikan...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Bot dimatikan...');
    process.exit(0);
});