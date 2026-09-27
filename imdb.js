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
      console.log("🎬 Trying IMDb API:", url);
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
    name: "imdb",
    aliases: ["movieinfo"],
    version: "1.0",
    author: "Mueid Mursalin Rifat",
    countDown: 5,
    role: 0,
    shortDescription: "🎬 Get IMDb movie/series info",
    longDescription: "Search and get detailed information about any movie or series",
    category: "info",
    guide: {
      en: "{pn} [movie/series name]\nExample: {pn} The Dark Knight\n{pn} Breaking Bad"
    }
  },

  onStart: async function ({ api, event, args }) {
    let loadingMsg = null;

    try {
      // Help message
      if (!args[0]) {
        return api.sendMessage(
          `🎬 IMDb Movie/Series Lookup\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 Usage:\n` +
          `• ${this.config.name} [movie or series name]\n\n` +
          `📍 Examples:\n` +
          `• .imdb The Dark Knight\n` +
          `• .imdb Inception\n\n` +
          `🔍 Get rating, plot, cast & more`,
          event.threadID,
          event.messageID
        );
      }

      const query = args.join(' ').trim();

      loadingMsg = await api.sendMessage(
        `🎬 Searching IMDb for "${query}"...\n⏳ Please wait`,
        event.threadID,
        event.messageID
      );

      // Call API via rotating mirrors
      const buildPath = `/api/imdb?q=${encodeURIComponent(query)}`;
      const { data, base } = await tryAllApis(buildPath, 15000);

      if (!data.success || !data.data) {
        throw new Error("No movie/series info found");
      }

      const m = data.data;

      // Trim long plot for mobile display
      const plot = m.plot && m.plot.length > 500
        ? m.plot.substring(0, 500) + '...'
        : (m.plot || "N/A");

      // Format released date
      let released = "N/A";
      if (m.released && m.released !== "N/A") {
        try {
          released = new Date(m.released).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        } catch (e) { released = m.released; }
      }

      const typeLabel = (m.type || "").toLowerCase() === "series" ? "📺 Series" : "🎬 Movie";

      const message =
        `🎬 IMDb Information\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${typeLabel} : ${m.title} (${m.year})\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⭐ IMDb     : ${m.imdbRating || "N/A"}\n` +
        `🍅 Rotten   : ${m.rottenRating || "N/A"}\n` +
        `📊 Metascore: ${m.metascore || "N/A"}\n` +
        `🎭 Genres   : ${m.genres || "N/A"}\n` +
        `⏱ Runtime  : ${m.runtime || "N/A"}\n` +
        `📅 Released : ${released}\n` +
        `🌍 Country  : ${m.country || "N/A"}\n` +
        `🗣 Languages: ${m.languages || "N/A"}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎥 Director : ${m.director || "N/A"}\n` +
        `✍️ Writer   : ${m.writer || "N/A"}\n` +
        `👥 Actors   : ${m.actors || "N/A"}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🏆 Awards   : ${m.awards || "N/A"}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📖 Plot:\n${plot}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔗 ${m.imdbUrl || "N/A"}\n` +
        `🔧 API : ${base}\n` +
        `⚡ ${data.operator || "ShadowX"}`;

      // Unsend loading message after send
      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      // Send with poster attached if available
      if (m.poster) {
        try {
          const posterStream = await global.utils.getStreamFromURL(m.poster);
          return api.sendMessage(
            { body: message, attachment: posterStream },
            event.threadID,
            event.messageID
          );
        } catch (posterErr) {
          // Fallback: text only
        }
      }

      return api.sendMessage(message, event.threadID, event.messageID);

    } catch (error) {
      console.error("IMDb lookup error:", error);

      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      let errorMessage = `❌ IMDb Lookup Failed\n`;
      errorMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (error.response) {
        errorMessage += `• API Error: ${error.response.status}\n`;
      } else if (error.request) {
        errorMessage += `• Network Error\n`;
        errorMessage += `• Check internet connection\n`;
      } else {
        errorMessage += `• ${error.message.substring(0, 80)}\n`;
      }

      errorMessage += `\n📌 Try again with a different title`;
      errorMessage += `\n📍 Example: .imdb Inception`;

      return api.sendMessage(errorMessage, event.threadID, event.messageID);
    }
  }
};
