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
      console.log("🎵 Trying Lyrics API:", url);
      const { data } = await axios.get(url, { timeout });
      if (data && data.success === true) {
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
    name: "lyrics",
    aliases: ["lyric"],
    version: "1.0",
    author: "Mueid Mursalin Rifat",
    countDown: 5,
    role: 0,
    shortDescription: "🎵 Get song lyrics",
    longDescription: "Search and get full lyrics of any song",
    category: "media",
    guide: {
      en: "{pn} [song name]\nExample: {pn} Believer\n{pn} Shape of You"
    }
  },

  onStart: async function ({ api, event, args }) {
    let loadingMsg = null;

    try {
      // Help message
      if (!args[0]) {
        return api.sendMessage(
          `🎵 Lyrics Finder\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 Usage:\n` +
          `• ${this.config.name} [song name]\n\n` +
          `📍 Examples:\n` +
          `• .lyrics Believer\n` +
          `• .lyrics Faded`,
          event.threadID,
          event.messageID
        );
      }

      const song = args.join(' ').trim();

      loadingMsg = await api.sendMessage(
        `🎵 Searching lyrics for "${song}"...\n⏳ Please wait`,
        event.threadID,
        event.messageID
      );

      // Call API via rotating mirrors
      const buildPath = `/api/lyrics?song=${encodeURIComponent(song)}`;
      const { data, base } = await tryAllApis(buildPath, 15000);

      if (!data.success || !data.lyrics) {
        throw new Error("No lyrics found");
      }

      const title = data.title || song;
      const artist = data.artist || "Unknown Artist";
      const lyrics = data.lyrics || "";
      const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];

      // Trim extremely long lyrics for Messenger limits
      const maxLen = 3500;
      const displayLyrics = lyrics.length > maxLen
        ? lyrics.substring(0, maxLen) + "\n\n... (truncated)"
        : lyrics;

      // Build suggestions block
      let sugBlock = "";
      if (suggestions.length) {
        sugBlock =
          `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 Other matches:\n` +
          suggestions
            .slice(0, 5)
            .map((s, i) => `${i + 1}. ${s.title} — ${s.artist}`)
            .join("\n") +
          `\n`;
      }

      const header =
        `🎵 Lyrics Found\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎤 Title  : ${title}\n` +
        `👤 Artist : ${artist}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      const footer =
        `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔧 API : ${base}\n` +
        `⚡ ${data.powered_by || data.operator || "ShadowX"}`;

      const message = header + displayLyrics + sugBlock + footer;

      // Unsend loading message after send
      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      // Send in chunks if too long
      if (message.length > 19000) {
        const parts = message.match(/[\s\S]{1,18000}/g) || [];
        for (const part of parts) {
          await api.sendMessage(part, event.threadID, event.messageID);
        }
        return;
      }

      return api.sendMessage(message, event.threadID, event.messageID);

    } catch (error) {
      console.error("Lyrics error:", error);

      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      let errorMessage = `❌ Lyrics Not Found\n`;
      errorMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (error.response) {
        errorMessage += `• API Error: ${error.response.status}\n`;
      } else if (error.request) {
        errorMessage += `• Network Error\n`;
        errorMessage += `• Check internet connection\n`;
      } else {
        errorMessage += `• ${error.message.substring(0, 80)}\n`;
      }

      errorMessage += `\n📌 Try again with different title`;
      errorMessage += `\n📍 Example: .lyrics Faded`;

      return api.sendMessage(errorMessage, event.threadID, event.messageID);
    }
  }
};
