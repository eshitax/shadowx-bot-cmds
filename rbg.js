const axios = require('axios');
const fs = require('fs');
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
async function tryAllApis(buildPath, timeout = 30000) {
  const apis = await getApiList();
  if (!apis.length) throw new Error("No APIs available (could not load API list)");

  let lastErr = null;

  for (const base of apis) {
    const url = `${base}${buildPath}`;
    try {
      console.log("🖼️ Trying RBG API:", url);
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
    name: "rbg",
    version: "2.0",
    author: "Mueid Mursalin Rifat",
    countDown: 10,
    role: 0,
    shortDescription: "Remove image background",
    longDescription: "Remove background from images using ShadowX API",
    category: "utility",
    guide: "{pn} [reply to image or URL]"
  },

  onStart: async function({ api, event, args, message }) {
    let processingMsg = null;

    try {
      let imageUrl;

      // Check for image reply
      if (event.type === "message_reply" && event.messageReply.attachments?.[0]) {
        imageUrl = event.messageReply.attachments[0].url;
      }
      // Check for URL argument
      else if (args[0]?.startsWith("http")) {
        imageUrl = args[0];
      }
      // Check for attachment
      else if (event.attachments?.[0]) {
        imageUrl = event.attachments[0].url;
      }
      else {
        return message.reply("❌ Please reply to an image or provide an image URL");
      }

      // Processing message
      processingMsg = await message.reply("🔄 Removing background...");

      // Call API via rotating mirrors
      const buildPath = `/api/rbg?url=${encodeURIComponent(imageUrl)}`;
      const { data, base } = await tryAllApis(buildPath, 30000);

      if (!data.success) {
        await api.unsendMessage(processingMsg.messageID);
        return message.reply("❌ Failed to remove background");
      }

      // Get processed image URL
      const processedUrl = data.image_info?.processed_url
        || data.download_options?.view_image
        || data.download_options?.api_result;

      if (!processedUrl) {
        await api.unsendMessage(processingMsg.messageID);
        return message.reply("❌ No processed image returned");
      }

      // Download result
      const imgRes = await axios.get(processedUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const tempPath = path.join(__dirname, `rbg_${Date.now()}.png`);
      fs.writeFileSync(tempPath, imgRes.data);

      // Send result
      await api.unsendMessage(processingMsg.messageID);
      await message.reply({
        body: `✅ Background removed!\n🖤 API : ${base}\n⚡ Source: ShadowX-rbg`,
        attachment: fs.createReadStream(tempPath)
      });

      // Cleanup
      fs.unlinkSync(tempPath);

    } catch (error) {
      console.error(error);
      if (processingMsg) {
        try { await api.unsendMessage(processingMsg.messageID); } catch (e) {}
      }
      message.reply(`❌ Something went wrong.\n${error.message}`);
    }
  }
};
