const axios = require("axios");

module.exports = {
  config: {
    name: "tikinfo",
    aliases: ["tiktokinfo"],
    category: "utility",
    author: "Mueid Mursalin Rifat",
    description: "Retrieve TikTok user information",
    guide: {
      en: "{pn} <username>\nExample: {pn} @tiktok or {pn} tiktok"
    }
  },

  onStart: async function ({ api, event, args }) {
    try {
      const username = args[0]; 

      if (!username) {
        return api.sendMessage(
          `📱 𝗧𝗶𝗸𝗧𝗼𝗸 𝗜𝗻𝗳𝗼\n━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 𝗨𝘀𝗮𝗴𝗲: .tiks <username>\n` +
          `📍 𝗘𝘅𝗮𝗺𝗽𝗹𝗲: .tiks @tiktok or .tiks tiktok\n\n` +
          `👨‍💻 Author: Mueid Mursalin Rifat`,
          event.threadID,
          event.messageID
        );
      }

      // Remove @ symbol if present
      const cleanUsername = username.replace('@', '');
      
      // Send loading message
      const waitMsg = await api.sendMessage(
        `🔍 Fetching TikTok info for @${cleanUsername}...`,
        event.threadID
      );

      const tiktokApiUrl = `https://www.tikwm.com/api/user/info?unique_id=@${cleanUsername}`;
      const response = await axios.get(tiktokApiUrl);
      const data = response.data.data;

      if (!data || !data.user) {
        await api.unsendMessage(waitMsg.messageID);
        return api.sendMessage(
          `❌ 𝗡𝗼 𝗱𝗮𝘁𝗮 𝗳𝗼𝘂𝗻𝗱\n━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 Please check the username and try again.`,
          event.threadID,
          event.messageID
        );
      }

      const user = data.user;
      const stats = data.stats;

      // Format numbers
      const formatNumber = (num) => {
        if (!num) return "0";
        if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
        if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
        return num.toString();
      };

      // Get user info
      const userInfo = 
`╔════════════════════════════╗
║     📱 𝗧𝗜𝗞𝗧𝗢𝗞 𝗜𝗡𝗙𝗢     ║
╚════════════════════════════╝

👤 𝗨𝗦𝗘𝗥 𝗣𝗥𝗢𝗙𝗜𝗟𝗘
━━━━━━━━━━━━━━━━━━━━━━━━━━
🔹 𝗜𝗗: ${user.id}
🔹 𝗡𝗶𝗰𝗸𝗻𝗮𝗺𝗲: ${user.nickname}
🔹 𝗨𝘀𝗲𝗿𝗻𝗮𝗺𝗲: @${user.uniqueId}
🔹 𝗦𝗶𝗴𝗻𝗮𝘁𝘂𝗿𝗲: ${user.signature || "No bio yet"}
🔹 𝗩𝗲𝗿𝗶𝗳𝗶𝗲𝗱: ${user.verified ? "✅ Yes" : "❌ No"}
🔹 𝗣𝗿𝗶𝘃𝗮𝘁𝗲: ${user.privateAccount ? "🔒 Yes" : "🌍 No"}

📊 𝗦𝗧𝗔𝗧𝗦
━━━━━━━━━━━━━━━━━━━━━━━━━━
👣 𝗙𝗼𝗹𝗹𝗼𝘄𝗶𝗻𝗴: ${formatNumber(stats.followingCount)}
👥 𝗙𝗼𝗹𝗹𝗼𝘄𝗲𝗿𝘀: ${formatNumber(stats.followerCount)}
❤️ 𝗛𝗲𝗮𝗿𝘁𝘀: ${formatNumber(stats.heartCount)}
🎬 𝗩𝗶𝗱𝗲𝗼𝘀: ${formatNumber(stats.videoCount)}

━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 Profile: https://tiktok.com/@${user.uniqueId}
👨‍💻 ShadowX `;

      // Delete loading message
      await api.unsendMessage(waitMsg.messageID);

      // Get avatar
      const avatarUrl = user.avatarLarger || user.avatarMedium || user.avatarThumb;

      api.sendMessage(
        {
          body: userInfo,
          attachment: await global.utils.getStreamFromURL(avatarUrl),
        },
        event.threadID,
        event.messageID
      );

    } catch (error) {
      console.error("TikTok error:", error);
      api.sendMessage(
        `❌ 𝗘𝗿𝗿𝗼𝗿 𝗼𝗰𝗰𝘂𝗿𝗿𝗲𝗱\n━━━━━━━━━━━━━━━━━━━━\n` +
        `🔧 ${error.message || "Something went wrong!"}\n\n` +
        `💡 Try again later or check the username.`,
        event.threadID,
        event.messageID
      );
    }
  }
};
