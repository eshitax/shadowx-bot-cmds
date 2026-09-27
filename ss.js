const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

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
async function tryAllApis(buildPath, timeout = 45000) {
  const apis = await getApiList();
  if (!apis.length) throw new Error("No APIs available (could not load API list)");

  let lastErr = null;

  for (const base of apis) {
    const url = `${base}${buildPath}`;
    try {
      console.log("📸 Trying Screenshot API:", url);
      const { data } = await axios.get(url, { timeout });
      if (data && data.success === true && data.screenshot?.data) {
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
    name: "ss",
    aliases: ["screenshot", "webss"],
    version: "1.0",
    author: "Mueid Mursalin Rifat",
    countDown: 5,
    role: 0,
    shortDescription: "📸 Take website screenshot",
    longDescription: "Capture a screenshot of any website (full page or half page)",
    category: "utility",
    guide: {
      en: "{pn} <url> [type]\n\nTypes: full (default), half\n\nExamples:\n{pn} https://github.com\n{pn} https://github.com half"
    }
  },

  onStart: async function ({ api, event, args }) {
    let loadingMsg = null;

    try {
      // Help message
      if (!args[0]) {
        return api.sendMessage(
          `📸 Website Screenshot\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 Usage:\n` +
          `• ${this.config.name} <url> [type]\n\n` +
          `📐 Types:\n` +
          `• full → Full page (1920x1080) [default]\n` +
          `• half → Half page\n\n` +
          `📍 Examples:\n` +
          `• .ss https://github.com\n` +
          `• .ss https://github.com half`,
          event.threadID,
          event.messageID
        );
      }

      // Parse URL and type
      let url = args[0].trim();
      let type = (args[1] || "full").toLowerCase();

      // Auto-prepend https:// if missing
      if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
      }

      // Validate type
      if (!["full", "half"].includes(type)) {
        return api.sendMessage(
          `❌ Invalid type: "${type}"\n\n` +
          `📐 Available types:\n` +
          `• full → Full page\n` +
          `• half → Half page`,
          event.threadID,
          event.messageID
        );
      }

      loadingMsg = await api.sendMessage(
        `📸 Taking screenshot...\n` +
        `🔗 URL : ${url}\n` +
        `📐 Type: ${type}\n` +
        `⏳ Please wait...`,
        event.threadID,
        event.messageID
      );

      // Call API via rotating mirrors
      const buildPath = `/api/ss?url=${encodeURIComponent(url)}&type=${type}`;
      const { data, base } = await tryAllApis(buildPath, 45000);

      const shot = data.screenshot;

      // Extract base64 → save as file
      const base64Data = shot.data.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      const cacheDir = path.join(__dirname, "cache");
      fs.ensureDirSync(cacheDir);

      const ext = shot.format || "png";
      const filePath = path.join(cacheDir, `ss_${Date.now()}.${ext}`);
      fs.writeFileSync(filePath, buffer);

      // Build reply
      const message =
        `📸 Screenshot Captured\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔗 URL    : ${url}\n` +
        `📐 Type   : ${data.type || type}\n` +
        `🖼 Format : ${shot.format?.toUpperCase() || "PNG"}\n` +
        `📦 Size   : ${shot.size_kb || (buffer.length / 1024).toFixed(2)} KB\n` +
        `🔧 API    : ${base}\n` +
        `⚡ ${data.operator || "ShadowX"}`;

      // Unsend loading message
      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      await api.sendMessage(
        { body: message, attachment: fs.createReadStream(filePath) },
        event.threadID,
        event.messageID
      );

      // Cleanup
      setTimeout(() => {
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
      }, 10000);

    } catch (error) {
      console.error("Screenshot error:", error);

      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      let errorMessage = `❌ Screenshot Failed\n`;
      errorMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (error.response) {
        errorMessage += `• API Error: ${error.response.status}\n`;
      } else if (error.request) {
        errorMessage += `• Network Error\n`;
        errorMessage += `• Check internet connection\n`;
      } else {
        errorMessage += `• ${error.message.substring(0, 80)}\n`;
      }

      errorMessage += `\n📌 Try again with a valid URL`;
      errorMessage += `\n📍 Example: .ss https://github.com`;

      return api.sendMessage(errorMessage, event.threadID, event.messageID);
    }
  }
};
