const setting = {
    botName: 'KickBot',
    version: '4.0.0',
    prefix: '!',
    
    // ===== OWNER = NOMOR LU YANG PUNYA HP =====
    ownerNumber: '6281284406156@s.whatsapp.net', // NOMOR LU!
    ownerName: 'Developer',
    
    // ===== BOT = NOMOR YANG MAU JADI BOT (HARUS BEDA!) =====
    // ⚠️ GANTI DENGAN NOMOR LAIN YANG MAU JADI BOT!
    botNumber: '6283180391763@s.whatsapp.net', // NOMOR BOT!
    
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