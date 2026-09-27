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
      console.log("🪪 Trying Fake Details API:", url);
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
    name: "fakedetails",
    aliases: ["fkdetails", "fakeinfo"],
    version: "1.0",
    author: "Mueid Mursalin Rifat",
    countDown: 5,
    role: 0,
    shortDescription: "🎭 Generate fake user details",
    longDescription: "Get realistic fake identity details",
    category: "fun",
    guide: {
      en: "{pn}\nExample: {pn}"
    }
  },

  onStart: async function ({ api, event }) {
    let loadingMsg = null;

    try {
      loadingMsg = await api.sendMessage(
        `🎭 Generating fake identity...\n⏳ Please wait`,
        event.threadID,
        event.messageID
      );

      const buildPath = `/api/fkdetails`;
      const { data, base } = await tryAllApis(buildPath, 15000);

      if (!data.success || !data.data) {
        throw new Error("No fake details returned");
      }

      const u = data.data;

      const message =
        `🎭 FAKE IDENTITY GENERATED\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 Name       : ${u.name}\n` +
        `⚧ Gender     : ${u.gender}\n` +
        `🎂 Birthdate  : ${u.dateOfBirth}\n` +
        `📅 Age        : ${u.age}\n` +
        `🌍 Nationality: ${u.nationality}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📍 Location   : ${u.location}\n` +
        `🕒 Timezone   : ${u.timezone}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📧 Email      : ${u.email}\n` +
        `📞 Phone      : ${u.phone}\n` +
        `📱 Cell       : ${u.cell}\n` +
        `🆔 Username   : ${u.username}\n` +
        `🪪 ID         : ${u.id}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ Fake data........\n` +
        `🔧 API : ${base}\n` +
        `⚡ ${data.operator || "ShadowX"}`;

      // Unsend loading message after sending the result
      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      // Try to send with the profile picture attached
      try {
        const picStream = await global.utils.getStreamFromURL(u.picture);
        return api.sendMessage(
          { body: message, attachment: picStream },
          event.threadID,
          event.messageID
        );
      } catch (picErr) {
        // Fallback: send text only if picture fails
        return api.sendMessage(message, event.threadID, event.messageID);
      }

    } catch (error) {
      console.error("Fake details error:", error);

      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      let errorMessage = `❌ Failed to generate fake details\n`;
      errorMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (error.response) {
        errorMessage += `• API Error: ${error.response.status}\n`;
      } else if (error.request) {
        errorMessage += `• Network Error\n`;
        errorMessage += `• Check internet connection\n`;
      } else {
        errorMessage += `• ${error.message.substring(0, 80)}\n`;
      }

      errorMessage += `\n🔁 Please try again`;

      return api.sendMessage(errorMessage, event.threadID, event.messageID);
    }
  }
};
