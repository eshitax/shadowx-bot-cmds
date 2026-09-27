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
      console.log("🔍 Trying Google API:", url);
      const { data } = await axios.get(url, { timeout });
      if (data && data.status === true) {
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
    name: "google",
    aliases: ["gsearch", "googlesearch"],
    version: "1.0",
    author: "Mueid Mursalin Rifat",
    countDown: 5,
    role: 0,
    shortDescription: "🔍 Search Google",
    longDescription: "Search Google and get top results with title, link, and snippet",
    category: "utility",
    guide: {
      en: "{pn} [search query]\nExample: {pn} MueidMursalinRifat\n{pn} best movies 2026"
    }
  },

  onStart: async function ({ api, event, args }) {
    let loadingMsg = null;

    try {
      // Help message
      if (!args[0]) {
        return api.sendMessage(
          `🔍 Google Search\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 Usage:\n` +
          `• ${this.config.name} [search query]\n\n` +
          `📍 Examples:\n` +
          `• .google MueidMursalinRifat\n` +
          `• .google nodejs tutorial`,
          event.threadID,
          event.messageID
        );
      }

      const query = args.join(' ').trim();

      loadingMsg = await api.sendMessage(
        `🔍 Searching Google for "${query}"...\n⏳ Please wait`,
        event.threadID,
        event.messageID
      );

      // Call API via rotating mirrors
      const buildPath = `/api/google?q=${encodeURIComponent(query)}`;
      const { data, base } = await tryAllApis(buildPath, 15000);

      if (!data.status || !Array.isArray(data.results) || data.results.length === 0) {
        throw new Error("No results found");
      }

      const results = data.results;

      // Build message
      let message =
        `🔍 Google Search Results\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📝 Query   : ${data.query || query}\n` +
        `📊 Results : ${results.length}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      results.forEach((r, i) => {
        const title = r.title || "Untitled";
        const link = r.link || "";
        const snippet = r.snippet
          ? (r.snippet.length > 180 ? r.snippet.substring(0, 180) + "..." : r.snippet)
          : "No description";

        message += `${i + 1}. ${title}\n`;
        message += `🔗 ${link}\n`;
        message += `📄 ${snippet}\n\n`;
      });

      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `🔧 API : ${base}\n`;
      message += `⚡ ${data.operator || "ShadowX"}`;

      // Unsend loading message after send
      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      // Chunk if too long
      if (message.length > 19000) {
        const parts = message.match(/[\s\S]{1,18000}/g) || [];
        for (const part of parts) {
          await api.sendMessage(part, event.threadID, event.messageID);
        }
        return;
      }

      return api.sendMessage(message, event.threadID, event.messageID);

    } catch (error) {
      console.error("Google search error:", error);

      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      let errorMessage = `❌ Search Failed\n`;
      errorMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (error.response) {
        errorMessage += `• API Error: ${error.response.status}\n`;
      } else if (error.request) {
        errorMessage += `• Network Error\n`;
        errorMessage += `• Check internet connection\n`;
      } else {
        errorMessage += `• ${error.message.substring(0, 80)}\n`;
      }

      errorMessage += `\n📌 Try again with different keywords`;
      errorMessage += `\n📍 Example: .google MueidMursalinRifat`;

      return api.sendMessage(errorMessage, event.threadID, event.messageID);
    }
  }
};
