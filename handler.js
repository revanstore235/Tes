const { setting } = require('./setting.js');
const cooldowns = new Map();

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
    parts.push(`${s}d`);
    return parts.join(' ');
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
        const mentions = metadata.participants.map(p => p.id);
        const text = args.join(' ') || '👥 *HIDETAG*\n\nSemua member telah dipanggil! 📢';
        await sock.sendMessage(groupId, { text, mentions }, { quoted: msg });
        console.log(`✅ Hidetag di grup ${metadata.subject}`);
    } catch (error) {
        console.error('❌ Error hidetag:', error.message);
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
        const senderInfo = metadata.participants.find(p => p.id === sender);
        if (!senderInfo?.admin) {
            return sock.sendMessage(groupId, { text: setting.messages.adminOnly }, { quoted: msg });
        }
        const botId = sock.user.id.replace(/:.*/, '') + '@s.whatsapp.net';
        const botInfo = metadata.participants.find(p => p.id === botId);
        if (!botInfo?.admin) {
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
        const text = `🤖 *${setting.botName}*\n\n` +
            `📛 *Nama Bot:* ${setting.botName}\n` +
            `🔢 *Versi:* ${setting.version}\n` +
            `👨‍💻 *Developer:* ${setting.ownerName}\n` +
            `📱 *Owner:* ${setting.ownerNumber.split('@')[0]}\n` +
            `⏰ *Uptime:* ${uptime}\n` +
            `💾 *Memory:* ${memory} MB\n` +
            `📡 *Status:* Online ✅\n\n` +
            `📋 *Commands:*\n` +
            `${setting.prefix}hidetag [teks] - Mention semua member\n` +
            `${setting.prefix}kick @user - Kick member (admin)\n` +
            `${setting.prefix}info - Info bot\n` +
            `${setting.prefix}ping - Cek bot\n\n` +
            `Made with ❤️ by ${setting.ownerName}`;
        await sock.sendMessage(chatId, { text });
        console.log(`✅ Info sent to ${chatId}`);
    } catch (error) {
        console.error('❌ Error info:', error.message);
    }
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

module.exports = { hidetag, kick, info, ping };
