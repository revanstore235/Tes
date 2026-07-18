const { setting } = require('./setting.js');
const axios = require('axios');

const cooldowns = new Map();

function normalizeJid(jid = '') {
    return jid.split(':')[0] + '@s.whatsapp.net';
}

function getParticipant(metadata, jid) {
    const id = normalizeJid(jid);
    return metadata.participants.find(p => normalizeJid(p.id) === id);
}

function botIsAdmin(sock, metadata) {
    const botId = normalizeJid(sock.authState.creds.me?.id || '');
    return metadata.participants.some(
        p => normalizeJid(p.id) === botId && (p.admin === 'admin' || p.admin === 'superadmin')
    );
}

function isCooldown(userId, command) {
    const key = `${userId}-${command}`;
    const now = Date.now();
    const cooldownTime = setting.cooldowns[command] || 3;
    if (cooldowns.has(key)) {
        const end = cooldowns.get(key);
        if (now < end) return Math.ceil((end - now) / 1000);
    }
    cooldowns.set(key, now + (cooldownTime * 1000));
    return false;
}

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (h > 0) parts.push(`${h}j`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
}

async function ping(sock, msg) {
    try {
        const start = Date.now();
        await sock.sendMessage(msg.key.remoteJid, { text: '🏓 Pong!' });
        const latency = Date.now() - start;
        await sock.sendMessage(msg.key.remoteJid, { text: `✅ Online!\n⏱️ ${latency}ms` });
    } catch (error) {
        console.error('❌ Error ping:', error.message);
    }
}

async function info(sock, msg) {
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const chatId = msg.key.remoteJid;
        const cd = isCooldown(sender, 'info');
        if (cd) {
            return sock.sendMessage(chatId, { text: setting.messages.cooldown(cd) }, { quoted: msg });
        }
        const uptime = formatUptime(process.uptime());
        const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const botId = sock.authState.creds.me?.id || 'Unknown';
        
        const text = `🤖 *${setting.botName}*\n\n` +
            `📛 *Nama Bot:* ${setting.botName}\n` +
            `🔢 *Versi:* ${setting.version}\n` +
            `👨‍💻 *Developer:* ${setting.ownerName}\n` +
            `📱 *Owner:* ${setting.ownerNumber.split('@')[0]}\n` +
            `🤖 *Bot:* ${botId.split('@')[0]}\n` +
            `⏰ *Uptime:* ${uptime}\n` +
            `💾 *Memory:* ${memory} MB\n` +
            `📡 *Status:* Online ✅\n\n` +
            `📋 *Commands:*\n` +
            `${setting.prefix}ping - Test bot\n` +
            `${setting.prefix}info - Info bot\n` +
            `${setting.prefix}menu - Menu\n` +
            `${setting.prefix}stalk [username] - Stalk Roblox\n` +
            `${setting.prefix}stalkepep [uid] - Stalk Epep\n` +
            `${setting.prefix}logo [teks] - Buat logo\n` +
            `${setting.prefix}hidetag - Mention semua (grup)\n` +
            `${setting.prefix}kick @user - Kick (grup)\n` +
            `${setting.prefix}add @user - Add (grup)\n` +
            `${setting.prefix}setdesc - Ganti deskripsi (grup)\n` +
            `${setting.prefix}setname - Ganti nama grup\n` +
            `${setting.prefix}leave - Keluar grup\n\n` +
            `Made with ❤️ by ${setting.ownerName}`;
        
        await sock.sendMessage(chatId, { text });
        console.log(`✅ Info sent to ${chatId}`);
    } catch (error) {
        console.error('❌ Error info:', error.message);
    }
}

async function menu(sock, msg) {
    try {
        const chatId = msg.key.remoteJid;
        const text = `📋 *MENU ${setting.botName}*\n\n` +
            `🔹 *Command Umum:*\n` +
            `${setting.prefix}ping - Test koneksi\n` +
            `${setting.prefix}info - Info bot\n` +
            `${setting.prefix}menu - Menu ini\n` +
            `${setting.prefix}stalk [username] - Stalk Roblox\n` +
            `${setting.prefix}stalkepep [uid] - Stalk Epep\n` +
            `${setting.prefix}logo [teks] - Buat logo\n\n` +
            `🔸 *Command Grup (Admin):*\n` +
            `${setting.prefix}hidetag - Mention semua member\n` +
            `${setting.prefix}kick @user - Kick member\n` +
            `${setting.prefix}add @user - Tambah member\n` +
            `${setting.prefix}setdesc [teks] - Ganti deskripsi\n` +
            `${setting.prefix}setname [nama] - Ganti nama grup\n` +
            `${setting.prefix}leave - Keluar dari grup\n\n` +
            `_Made with ❤️ by ${setting.ownerName}_`;
        await sock.sendMessage(chatId, { text });
    } catch (error) {
        console.error('❌ Error menu:', error.message);
    }
}

async function stalk(sock, msg, args) {
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const chatId = msg.key.remoteJid;
        
        const cd = isCooldown(sender, 'stalk');
        if (cd) {
            return sock.sendMessage(chatId, { text: setting.messages.cooldown(cd) }, { quoted: msg });
        }
        
        const username = args.join(' ');
        if (!username) {
            return sock.sendMessage(chatId, { text: '❌ Masukkan username Roblox!\nCara: !stalk [username]' }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { text: `⏳ Sedang mencari data ${username}...` });

        try {
            const response = await axios.get(`https://api.ikyyxd.my.id/stalk/roblox?username=${encodeURIComponent(username)}`);
            const data = response.data;

            if (data.status === 200 && data.result && data.result.username) {
                const user = data.result;
                const text = `🎮 *STALK ROBLOX*\n\n` +
                    `👤 *Username:* ${user.username || 'Tidak diketahui'}\n` +
                    `🆔 *User ID:* ${user.userId || 'Tidak diketahui'}\n` +
                    `📅 *Bergabung:* ${user.joinDate || 'Tidak diketahui'}\n` +
                    `🕐 *Online:* ${user.isOnline ? '✅ Online' : '❌ Offline'}\n` +
                    `🎨 *Display Name:* ${user.displayName || 'Tidak diketahui'}\n` +
                    `👥 *Followers:* ${user.followers || '0'}\n` +
                    `👤 *Following:* ${user.following || '0'}\n` +
                    `📊 *Friends:* ${user.friends || '0'}\n\n` +
                    `🔗 *Profile:* https://www.roblox.com/users/${user.userId}/profile`;
                
                await sock.sendMessage(chatId, { text });
                console.log(`✅ Stalk ${username} berhasil`);
            } else {
                await sock.sendMessage(chatId, { text: `❌ Tidak ditemukan akun Roblox *${username}*` });
            }
        } catch (apiError) {
            console.error('API Error:', apiError.message);
            await sock.sendMessage(chatId, { 
                text: `❌ Gagal mengambil data Roblox untuk *${username}*\nCoba lagi nanti.` 
            });
        }
    } catch (error) {
        console.error('❌ Error stalk:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Terjadi error saat men-stalk.' });
    }
}

async function stalkepep(sock, msg, args) {
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const chatId = msg.key.remoteJid;
        
        const cd = isCooldown(sender, 'stalkepep');
        if (cd) {
            return sock.sendMessage(chatId, { text: setting.messages.cooldown(cd) }, { quoted: msg });
        }
        
        const uid = args.join(' ');
        if (!uid) {
            return sock.sendMessage(chatId, { text: '❌ Masukkan UID Epep!\nCara: !stalkepep [uid]' }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { text: `⏳ Sedang mencari data UID ${uid}...` });

        try {
            const response = await axios.get(`https://api.ikyyxd.my.id/stalk/epepid?uid=${encodeURIComponent(uid)}`);
            const data = response.data;

            if (data.status === 200 && data.result) {
                const user = data.result;
                const text = `🎮 *STALK EPEP*\n\n` +
                    `👤 *Username:* ${user.username || 'Tidak diketahui'}\n` +
                    `🆔 *UID:* ${user.uid || 'Tidak diketahui'}\n` +
                    `📊 *Level:* ${user.level || '0'}\n` +
                    `💎 *Diamond:* ${user.diamond || '0'}\n` +
                    `💰 *Gold:* ${user.gold || '0'}\n` +
                    `🏆 *Prestige:* ${user.prestige || '0'}`;
                
                await sock.sendMessage(chatId, { text });
                console.log(`✅ Stalk Epep ${uid} berhasil`);
            } else {
                await sock.sendMessage(chatId, { text: `❌ Tidak ditemukan akun Epep dengan UID *${uid}*` });
            }
        } catch (apiError) {
            console.error('API Error:', apiError.message);
            await sock.sendMessage(chatId, { 
                text: `❌ Gagal mengambil data Epep untuk UID *${uid}*\nCoba lagi nanti.` 
            });
        }
    } catch (error) {
        console.error('❌ Error stalkepep:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Terjadi error saat men-stalk.' });
    }
}

async function logomaker(sock, msg, args) {
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const chatId = msg.key.remoteJid;
        
        const cd = isCooldown(sender, 'logo');
        if (cd) {
            return sock.sendMessage(chatId, { text: setting.messages.cooldown(cd) }, { quoted: msg });
        }
        
        const text = args.join(' ');
        if (!text) {
            return sock.sendMessage(chatId, { text: '❌ Masukkan teks untuk logo!\nCara: !logo [teks]' }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { text: `⏳ Sedang membuat logo untuk "${text}"...` });

        try {
            const response = await axios.get(`https://api.ikyyxd.my.id/image/logo?text=${encodeURIComponent(text)}`, {
                responseType: 'arraybuffer'
            });
            
            const buffer = Buffer.from(response.data);
            
            await sock.sendMessage(chatId, {
                image: buffer,
                caption: `✅ *LOGO BERHASIL DIBUAT!*\n\n📝 Teks: ${text}\n📱 ${setting.botName}`
            });
            console.log(`✅ Logo ${text} berhasil dibuat`);
        } catch (apiError) {
            console.error('API Error:', apiError.message);
            await sock.sendMessage(chatId, { 
                text: `❌ Gagal membuat logo untuk *${text}*\nCoba lagi nanti.` 
            });
        }
    } catch (error) {
        console.error('❌ Error logo:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Terjadi error saat membuat logo.' });
    }
}

async function hidetag(sock, msg, args) {
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const groupId = msg.key.remoteJid;
        
        if (!groupId.endsWith('@g.us')) {
            return sock.sendMessage(groupId, { text: setting.messages.groupOnly });
        }
        
        const cd = isCooldown(sender, 'hidetag');
        if (cd) {
            return sock.sendMessage(groupId, { text: setting.messages.cooldown(cd) }, { quoted: msg });
        }
        
        const metadata = await sock.groupMetadata(groupId);
        
        if (!botIsAdmin(sock, metadata)) {
            return sock.sendMessage(groupId, { text: setting.messages.botNotAdmin }, { quoted: msg });
        }
        
        const mentions = metadata.participants.map(p => p.id);
        const text = args.join(' ') || '👥 *HIDETAG*\n\nSemua member telah dipanggil! 📢';
        
        await sock.sendMessage(groupId, { text, mentions }, { quoted: msg });
        console.log(`✅ Hidetag di grup ${metadata.subject}`);
    } catch (error) {
        console.error('❌ Error hidetag:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal hidetag: ' + error.message });
    }
}

async function kick(sock, msg, args) {
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const groupId = msg.key.remoteJid;
        
        if (!groupId.endsWith('@g.us')) {
            return sock.sendMessage(groupId, { text: setting.messages.groupOnly });
        }
        
        const metadata = await sock.groupMetadata(groupId);
        const senderInfo = getParticipant(metadata, sender);
        
        if (!senderInfo?.admin) {
            return sock.sendMessage(groupId, { text: setting.messages.adminOnly }, { quoted: msg });
        }
        
        if (!botIsAdmin(sock, metadata)) {
            return sock.sendMessage(groupId, { text: setting.messages.botNotAdmin }, { quoted: msg });
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
            return sock.sendMessage(groupId, { text: setting.messages.noTarget }, { quoted: msg });
        }
        
        if (target === sender) {
            return sock.sendMessage(groupId, { text: setting.messages.cantKickSelf }, { quoted: msg });
        }
        
        if (target === setting.ownerNumber) {
            return sock.sendMessage(groupId, { text: setting.messages.cantKickOwner }, { quoted: msg });
        }
        
        const cd = isCooldown(sender, 'kick');
        if (cd) {
            return sock.sendMessage(groupId, { text: setting.messages.cooldown(cd) }, { quoted: msg });
        }
        
        await sock.groupParticipantsUpdate(groupId, [target], 'remove');
        await sock.sendMessage(groupId, {
            text: setting.messages.kicked(target),
            mentions: [target]
        });
        console.log(`✅ Kick @${target.split('@')[0]} dari ${metadata.subject}`);
    } catch (error) {
        console.error('❌ Error kick:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal kick: ' + error.message });
    }
}

async function add(sock, msg, args) {
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const groupId = msg.key.remoteJid;
        
        if (!groupId.endsWith('@g.us')) {
            return sock.sendMessage(groupId, { text: setting.messages.groupOnly });
        }
        
        const metadata = await sock.groupMetadata(groupId);
        const senderInfo = getParticipant(metadata, sender);
        
        if (!senderInfo?.admin) {
            return sock.sendMessage(groupId, { text: setting.messages.adminOnly }, { quoted: msg });
        }
        
        if (!botIsAdmin(sock, metadata)) {
            return sock.sendMessage(groupId, { text: setting.messages.botNotAdmin }, { quoted: msg });
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
            return sock.sendMessage(groupId, { text: '❌ Tag user yang mau di-add!\nCara: !add @user' }, { quoted: msg });
        }
        
        await sock.groupParticipantsUpdate(groupId, [target], 'add');
        await sock.sendMessage(groupId, {
            text: `✅ *ADDED!*\n\n@${target.split('@')[0]} telah ditambahkan ke grup!`,
            mentions: [target]
        });
        console.log(`✅ Add @${target.split('@')[0]} ke ${metadata.subject}`);
    } catch (error) {
        console.error('❌ Error add:', error.message);
    }
}

async function setdesc(sock, msg, args) {
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const groupId = msg.key.remoteJid;
        
        if (!groupId.endsWith('@g.us')) {
            return sock.sendMessage(groupId, { text: setting.messages.groupOnly });
        }
        
        const metadata = await sock.groupMetadata(groupId);
        const senderInfo = getParticipant(metadata, sender);
        
        if (!senderInfo?.admin) {
            return sock.sendMessage(groupId, { text: setting.messages.adminOnly }, { quoted: msg });
        }
        
        if (!botIsAdmin(sock, metadata)) {
            return sock.sendMessage(groupId, { text: setting.messages.botNotAdmin }, { quoted: msg });
        }
        
        const newDesc = args.join(' ');
        if (!newDesc) {
            return sock.sendMessage(groupId, { text: '❌ Masukkan deskripsi baru!\nCara: !setdesc Deskripsi baru' }, { quoted: msg });
        }
        
        await sock.groupUpdateDescription(groupId, newDesc);
        await sock.sendMessage(groupId, {
            text: `✅ *DESKRIPSI DIUBAH!*\n\n📝 Deskripsi baru: ${newDesc}`
        });
        console.log(`✅ Deskripsi grup ${metadata.subject} diubah`);
    } catch (error) {
        console.error('❌ Error setdesc:', error.message);
    }
}

async function setname(sock, msg, args) {
    try {
        const sender = msg.key.participant || msg.key.remoteJid;
        const groupId = msg.key.remoteJid;
        
        if (!groupId.endsWith('@g.us')) {
            return sock.sendMessage(groupId, { text: setting.messages.groupOnly });
        }
        
        const metadata = await sock.groupMetadata(groupId);
        const senderInfo = getParticipant(metadata, sender);
        
        if (!senderInfo?.admin) {
            return sock.sendMessage(groupId, { text: setting.messages.adminOnly }, { quoted: msg });
        }
        
        if (!botIsAdmin(sock, metadata)) {
            return sock.sendMessage(groupId, { text: setting.messages.botNotAdmin }, { quoted: msg });
        }
        
        const newName = args.join(' ');
        if (!newName) {
            return sock.sendMessage(groupId, { text: '❌ Masukkan nama baru!\nCara: !setname Nama grup baru' }, { quoted: msg });
        }
        
        await sock.groupUpdateSubject(groupId, newName);
        await sock.sendMessage(groupId, {
            text: `✅ *NAMA GRUP DIUBAH!*\n\n📛 Nama baru: ${newName}`
        });
        console.log(`✅ Nama grup diubah menjadi ${newName}`);
    } catch (error) {
        console.error('❌ Error setname:', error.message);
    }
}

async function leave(sock, msg) {
    try {
        const groupId = msg.key.remoteJid;
        
        if (!groupId.endsWith('@g.us')) {
            return sock.sendMessage(groupId, { text: setting.messages.groupOnly });
        }
        
        await sock.sendMessage(groupId, { text: '👋 Bot keluar dari grup ini. Bye bye!' });
        await sock.groupLeave(groupId);
        console.log(`✅ Bot keluar dari grup`);
    } catch (error) {
        console.error('❌ Error leave:', error.message);
    }
}

async function owner(sock, msg) {
    try {
        const chatId = msg.key.remoteJid;
        await sock.sendMessage(chatId, {
            text: `👨‍💻 *Owner Bot*\n\n📱 Nomor: ${setting.ownerNumber.split('@')[0]}\n💬 Hubungi untuk lapor bug atau request fitur.`
        });
    } catch (error) {
        console.error('❌ Error owner:', error.message);
    }
}

module.exports = {
    ping,
    info,
    menu,
    stalk,
    stalkepep,
    logomaker,
    hidetag,
    kick,
    add,
    setdesc,
    setname,
    leave,
    owner
};