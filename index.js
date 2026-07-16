const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const { setting } = require('./setting.js');
const { hidetag, kick, info, ping } = require('./handler.js');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Global error handlers untuk mencegah crash
process.on('uncaughtException', (error) => {
    console.error('❌ UNCAUGHT EXCEPTION:', error.message);
    console.error(error.stack);
    // Jangan exit, biarkan bot coba reconnect
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ UNHANDLED REJECTION:', reason);
    // Jangan exit, biarkan bot coba reconnect
});

async function cleanupInvalidSession() {
    try {
        if (fs.existsSync(setting.sessionPath)) {
            const files = fs.readdirSync(setting.sessionPath);
            if (files.length > 0) {
                console.log('🔄 Membersihkan session lama...');
                fs.rmSync(setting.sessionPath, { recursive: true, force: true });
                await sleep(1000);
            }
        }
    } catch (error) {
        console.warn('⚠️ Tidak bisa cleanup session:', error.message);
    }
}

async function startBot() {
    try {
        // Buat folder session jika belum ada
        if (!fs.existsSync(setting.sessionPath)) {
            fs.mkdirSync(setting.sessionPath, { recursive: true });
            console.log('✅ Folder session dibuat');
        }

        const { state, saveCreds } = await useMultiFileAuthState(setting.sessionPath);
        let version;
        
        try {
            const versionData = await fetchLatestBaileysVersion();
            version = versionData.version;
        } catch (versionError) {
            console.warn('⚠️ Gagal fetch versi Baileys terbaru, pakai default');
            version = [2, 3000, 1017531287];
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🤖 ${setting.botName} v${setting.version}`);
        console.log(`📦 Baileys v${version.join('.')}`);
        console.log(`👨‍💻 Owner: ${setting.ownerNumber.split('@')[0]}`);
        console.log(`📱 Bot Number: ${setting.botNumber}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.windows('Desktop'),
            markOnlineOnConnect: true,
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            shouldSyncHistoryMessage: () => false,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 60000,
            connectTimeoutMs: setting.connectTimeoutMs,
            maxMsgRetryCount: 5
        });

        await sleep(3000);

        // Check jika belum registered, minta pairing code
        if (!sock.authState.creds.registered) {
            console.log('📱 Meminta Pairing Code...\n');
            try {
                const phoneNumber = setting.botNumber;
                console.log(`📞 Nomor Bot: ${phoneNumber}`);
                console.log('⏳ Tunggu sebentar...');
                
                const code = await sock.requestPairingCode(phoneNumber);
                
                if (code) {
                    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log(`✅ PAIRING CODE: *${code}*`);
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('\n📱 CARA PAIRING (PENTING!):\n');
                    console.log('1️⃣ Buka WhatsApp di HP kamu');
                    console.log('2️⃣ Tap ⋮ (3 titik) di kanan bawah');
                    console.log('3️⃣ Pilih "Perangkat Tertaut"');
                    console.log('4️⃣ Tap "Tautkan Perangkat"');
                    console.log('5️⃣ Pilih "Tautkan dengan Nomor Telepon"');
                    console.log(`6️⃣ MASUKKAN KODE INI: *${code}*`);
                    console.log(`7️⃣ Nomor yang harus dipakai: *${setting.botNumber}*`);
                    console.log('\n⏳ Bot menunggu pairing dari HP...');
                    console.log('Jangan tutup screen ini, tunggu sampai ada notifikasi "BOT CONNECTED"\n');
                } else {
                    console.error('❌ Pairing code tidak didapat (null)');
                    await sleep(5000);
                    startBot();
                }
            } catch (pairingError) {
                console.error('❌ Error mendapatkan pairing code:');
                console.error(pairingError.message);
                console.log('\n⏳ Akan coba ulang dalam 10 detik...');
                await sleep(10000);
                await cleanupInvalidSession();
                startBot();
            }
        } else {
            console.log('✅ Session ditemukan! Menghubungkan kembali...\n');
        }

        // Connection update events
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (connection === 'open') {
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`✅ BOT SUCCESSFULLY CONNECTED!`);
                console.log(`📱 Nomor Bot: ${sock.user?.id || 'Loading...'}`);
                console.log(`👨‍💻 Owner: ${setting.ownerNumber.split('@')[0]}`);
                console.log(`📝 Prefix: "${setting.prefix}"`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                console.log('📨 Bot siap menerima pesan!\n');
            }
            
            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log(`\n❌ Disconnected (Status: ${statusCode})`);
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                    console.log('⚠️ Session tidak valid, membersihkan dan memulai ulang...');
                    await cleanupInvalidSession();
                    await sleep(3000);
                    startBot();
                } else {
                    console.log(`🔄 Reconnect dalam ${setting.reconnectDelay / 1000} detik...`);
                    await sleep(setting.reconnectDelay);
                    startBot();
                }
            }
            
            if (connection === 'connecting') {
                console.log('🔌 Connecting ke WhatsApp server...');
            }
        });

        // Credentials update - simpan otomatis
        sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                console.log('💾 Credentials tersimpan');
            } catch (error) {
                console.error('❌ Error menyimpan credentials:', error.message);
            }
        });

        // Messages handling
        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
                const msg = messages[0];
                
                if (!msg.message || msg.key.fromMe) return;
                
                let text = '';
                if (msg.message.conversation) {
                    text = msg.message.conversation;
                } else if (msg.message.extendedTextMessage) {
                    text = msg.message.extendedTextMessage?.text || '';
                } else if (msg.message.imageMessage) {
                    text = msg.message.imageMessage?.caption || '';
                } else if (msg.message.videoMessage) {
                    text = msg.message.videoMessage?.caption || '';
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
        console.error('❌ Fatal error di startBot:', error.message);
        console.error(error.stack);
        console.log('\n⏳ Restart dalam 10 detik...\n');
        await sleep(10000);
        startBot();
    }
}

console.log('🚀 Starting WhatsApp Bot...\n');
startBot().catch(err => {
    console.error('❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n\n👋 Bot dimatikan...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 Bot dimatikan...');
    process.exit(0);
});
