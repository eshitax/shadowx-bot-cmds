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
async function tryAllApis(buildPath, timeout = 15000) {
  const apis = await getApiList();
  if (!apis.length) throw new Error("No APIs available (could not load API list)");

  let lastErr = null;

  for (const base of apis) {
    const url = `${base}${buildPath}`;
    try {
      console.log("📖 Trying Surah API:", url);
      const { data } = await axios.get(url, { timeout });
      // Surah API returns an object keyed by "0" plus "operator"
      if (data && typeof data === "object" && data["0"]) {
        console.log("✅ Success from:", base);
        return { data, base };
      }
      console.log("⚠️ API returned no surah:", base);
    } catch (e) {
      console.log("❌ API failed:", base, "-", e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All APIs failed");
}

module.exports = {
  config: {
    name: 'surah',
    aliases: ['surahinfo', 'quransurah', 'sinfo'],
    version: '2.0',
    author: 'Mueid Mursalin Rifat',
    countDown: 5,
    role: 0,
    shortDescription: 'Get information about Quranic Surahs',
    longDescription: 'Search and get detailed information about any Quranic chapter by number, name, or similar terms',
    category: 'info',
    guide: {
      en: '{pn} [surah number/name]\nExample: {pn} 1\n{pn} Al-Fatiha\n{pn} fatiha'
    }
  },

  onStart: async function ({ api, event, args }) {
    let waitingMsg = null;

    try {
      // Help message
      if (args.length === 0) {
        return api.sendMessage(
          `📖 Quranic Surah Information\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 Usage:\n` +
          `• ${this.config.name} [surah number/name]\n\n` +
          `📍 Examples:\n` +
          `• .surah 1\n` +
          `• .surah Al-Fatiha\n` +
          `• .surah fatiha\n\n` +
          `🔍 Search by:\n` +
          `• Surah number (1-114)\n` +
          `• English name\n` +
          `• Arabic name\n` +
          `• Bangla name\n` +
          `• Similar / short name`,
          event.threadID,
          event.messageID
        );
      }

      const searchQuery = args.join(' ');

      waitingMsg = await api.sendMessage(
        `📖 Searching for Surah: "${searchQuery}"...\n⏳ Please wait...`,
        event.threadID,
        event.messageID
      );

      // Call API via rotating mirrors
      const buildPath = `/api/surah?find=${encodeURIComponent(searchQuery)}`;
      const { data, base } = await tryAllApis(buildPath, 15000);

      const surah = data["0"];

      if (!surah) {
        try { await api.deleteMessage(waitingMsg.messageID); } catch (e) {}
        return api.sendMessage(
          `❌ No Surah found for: "${searchQuery}"\n\n` +
          `📌 Try searching with:\n` +
          `• Exact surah number (1-114)\n` +
          `• Full name: Al-Fatiha, Al-Baqarah\n` +
          `• Arabic name: الفاتحة, البقرة\n` +
          `• Bangla name: আল-ফাতিহা\n` +
          `• Similar term: fatiha, baqara`,
          event.threadID,
          event.messageID
        );
      }

      // ---- Build message (simple typing, all info kept) ----
      let message = `╔══════════════════════════════╗\n`;
      message += `║        📖 SURAH INFO         ║\n`;
      message += `╚══════════════════════════════╝\n\n`;

      // Header
      message += `🕌 Surah ${surah.surah_number}: ${surah.name_ar}\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      // Names
      message += `📌 NAMES\n`;
      message += `• English : ${surah.name_en}\n`;
      message += `• Arabic  : ${surah.name_ar}\n`;
      message += `• Bangla  : ${surah.name_bn}\n`;
      message += `• Meaning : ${surah.meaning_en} (${surah.meaning_bn})\n\n`;

      // Basic info
      message += `📊 BASIC INFO\n`;
      message += `• Number     : ${surah.surah_number}\n`;
      message += `• Verses     : ${surah.ayat}\n`;
      message += `• Revelation : ${surah.revelation}\n\n`;

      // Short description
      message += `📝 DESCRIPTION\n`;
      message += `${surah.about_short}\n\n`;

      // About (English)
      if (surah.about_en && surah.about_en.length > 0) {
        const aboutEn = surah.about_en.length > 500
          ? surah.about_en.substring(0, 500) + '...'
          : surah.about_en;
        message += `📖 ABOUT (English)\n`;
        message += `${aboutEn}\n\n`;
      }

      // About (Bangla)
      if (surah.about_bn && surah.about_bn.length > 0) {
        const aboutBn = surah.about_bn.length > 300
          ? surah.about_bn.substring(0, 300) + '...'
          : surah.about_bn;
        message += `📖 ABOUT (Bangla)\n`;
        message += `${aboutBn}\n\n`;
      }

      // Footer
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `🔍 Search any Surah: .surah [name/number]\n`;
      if (data.operator) {
        message += `⚡ Powered by: ${data.operator}\n`;
      }
      message += `🔧 API : ${base}\n`;
      message += `🤲 May Allah bless your Quranic learning!`;

      try { await api.deleteMessage(waitingMsg.messageID); } catch (e) {}

      return api.sendMessage(message, event.threadID, event.messageID);

    } catch (error) {
      console.error('Error fetching surah info:', error);

      try {
        if (waitingMsg) await api.deleteMessage(waitingMsg.messageID);
      } catch (e) {}

      let errorMessage = `❌ Error Fetching Surah Info\n`;
      errorMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (error.response) {
        if (error.response.status === 404) {
          errorMessage += `⚠️ Surah not found\n`;
          errorMessage += `• Check your spelling\n`;
          errorMessage += `• Try exact surah number (1-114)\n`;
        } else {
          errorMessage += `⚠️ API Error: ${error.response.status}\n`;
        }
      } else if (error.request) {
        errorMessage += `🌐 Network Error\n`;
        errorMessage += `• Check your internet connection\n`;
      } else {
        errorMessage += `🔧 Error: ${error.message}\n`;
      }

      errorMessage += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      errorMessage += `📌 Popular Surah Searches:\n`;
      errorMessage += `• .surah 1 (Al-Fatiha)\n`;
      errorMessage += `• .surah 112 (Al-Ikhlas)\n`;
      errorMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      return api.sendMessage(errorMessage, event.threadID, event.messageID);
    }
  }
};
