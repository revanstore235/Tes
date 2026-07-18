const setting = {
    botName: 'bot',
    version: '1.0.0',
    prefix: '!',
    ownerNumber: '6281284406155@s.whatsapp.net',
    ownerName: 'Developer',
    sessionPath: './session',
    reconnectDelay: 5000,

    cooldowns: {
        ping: 2,
        info: 3,
        menu: 2,

        stalk: 5,
        stalkepep: 5,
        logo: 10,

        hidetag: 10,
        kick: 5,
        add: 5,
        setdesc: 5,
        setname: 5,
        leave: 5
    },

    messages: {
        groupOnly: '❌ Command ini hanya bisa dipakai di grup!',
        adminOnly: '❌ Cuma admin yang bisa pakai command ini!',
        botNotAdmin: '❌ Bot harus jadi admin dulu!',
        cooldown: (time) =>
            `⏳ Cooldown! Tunggu ${time} detik lagi.`,

        kicked: (user) =>
            `👢 *KICKED!*\\n\\n@${user.split('@')[0]} telah ditendang!`,

        cantKickSelf:
            '❌ Gak bisa kick diri sendiri!',

        cantKickOwner:
            '❌ Gak bisa kick owner bot!',

        noTarget:
            '❌ Tag atau reply user yang mau di-kick!\\nCara: !kick @user'
    }
};

module.exports = { setting };