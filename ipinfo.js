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
      console.log("🌐 Trying IP Info API:", url);
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
    name: "ipinfo",
    aliases: ["ip", "iplookup", "ipaddress"],
    version: "1.0",
    author: "Mueid Mursalin Rifat",
    countDown: 5,
    role: 0,
    shortDescription: "🌐 Get IP address information",
    longDescription: "Look up detailed information about any IP address",
    category: "utility",
    guide: {
      en: "{pn} [IP address]\nExample: {pn} 1.1.1.1\n{pn} 8.8.8.8"
    }
  },

  onStart: async function ({ api, event, args }) {
    let loadingMsg = null;

    try {
      // Help message
      if (!args[0]) {
        return api.sendMessage(
          `🌐 IP Address Lookup\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 Usage:\n` +
          `• ${this.config.name} [IP address]\n\n` +
          `📍 Examples:\n` +
          `• .ipinfo 1.1.1.1\n` +
          `• .ipinfo 192.168.1.1\n\n` +
          `🔍 Get location, ISP, timezone & more`,
          event.threadID,
          event.messageID
        );
      }

      const ip = args[0].trim();

      // Basic IP format validation
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(ip)) {
        return api.sendMessage(
          `❌ Invalid IP address: "${ip}"\n\n` +
          `📌 Format: xxx.xxx.xxx.xxx\n` +
          `📍 Example: 1.1.1.1`,
          event.threadID,
          event.messageID
        );
      }

      loadingMsg = await api.sendMessage(
        `🌐 Looking up ${ip}...\n⏳ Please wait`,
        event.threadID,
        event.messageID
      );

      // Call API via rotating mirrors
      const buildPath = `/api/ip?address=${encodeURIComponent(ip)}`;
      const { data, base } = await tryAllApis(buildPath, 15000);

      if (!data.status) {
        throw new Error("IP lookup failed");
      }

      // Build message
      const message =
        `🌐 IP INFORMATION\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🖥 IP Address  : ${data.ip}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌍 Country     : ${data.country} (${data.countryCode})\n` +
        `🏙 City        : ${data.city || "N/A"}\n` +
        `📍 Region      : ${data.regionName || "N/A"}${data.region ? ` (${data.region})` : ""}\n` +
        `🌏 Continent   : ${data.continent || "N/A"}\n` +
        `📮 ZIP Code    : ${data.zip || "N/A"}\n` +
        `🕒 Timezone    : ${data.timezone || "N/A"}\n` +
        `💰 Currency    : ${data.currency || "N/A"}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📡 Coordinates : ${data.latitude}, ${data.longitude}\n` +
        `🏢 Organization: ${data.organization || "N/A"}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔧 API : ${base}\n` +
        `⚡ ${data.operator || "ShadowX"}`;

      // Unsend loading message after send
      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      return api.sendMessage(message, event.threadID, event.messageID);

    } catch (error) {
      console.error("IP lookup error:", error);

      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      let errorMessage = `❌ IP Lookup Failed\n`;
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
