const setting = {
    botName: 'KickBot',
    version: '4.0.0',
    prefix: '!',
    ownerNumber: '6281284406155@s.whatsapp.net',
    botNumber: '6283180391763',
    ownerName: 'Developer',
    sessionPath: './session',
    reconnectDelay: 5000,
    cooldowns: {
        hidetag: 10,
        kick: 5,
        info: 3,
        ping: 2
    },
    messages: {
        groupOnly: '❌ Command ini hanya bisa dipakai di grup!',
        adminOnly: '❌ Cuma admin yang bisa pakai command ini!',
        botNotAdmin: '❌ Bot harus jadi admin dulu!',
        cooldown: (time) => `⏳ Cooldown! Tunggu ${time} detik lagi.`,
        kicked: (user) => `👢 *KICKED!*\n\n@${user.split('@')[0]} telah ditendang!`,
        cantKickSelf: '❌ Gak bisa kick diri sendiri!',
        cantKickOwner: '❌ Gak bisa kick owner bot!',
        noTarget: '❌ Tag atau reply user yang mau di-kick!\nCara: !kick @user'
    }
};

module.exports = { setting };