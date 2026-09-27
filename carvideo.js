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
async function tryAllApis(buildPath, timeout = 20000) {
  const apis = await getApiList();
  if (!apis.length) throw new Error("No APIs available (could not load API list)");

  let lastErr = null;

  for (const base of apis) {
    const url = `${base}${buildPath}`;
    try {
      console.log("Trying Car Video API:", url);
      const { data } = await axios.get(url, { timeout });
      if (data && data.success === true) {
        console.log("Success from:", base);
        return { data, base };
      }
      console.log("API returned unsuccessful:", base);
    } catch (e) {
      console.log("API failed:", base, "-", e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All APIs failed");
}

module.exports = {
  config: {
    name: "carvideo",
    aliases: ['carv', 'carvid'],
    version: "3.0",
    author: "Mueid Mursalin Rifat",
    countDown: 10,
    role: 0,
    shortDescription: "Get random car video",
    longDescription: "Fetch car videos from ShadowX API",
    category: "media",
    guide: "{pn}",
    aliases: ["carvideo", "cars", "autovideo"]
  },

  onStart: async function({ api, event, message }) {
    let loadingMsg = null;

    try {
      loadingMsg = await message.reply(
        `🏎️ Summoning a ride with pure aura...\n⏳ Please wait`
      );

      // Fetch via rotating mirrors
      const buildPath = `/api/carvideo`;
      const { data, base } = await tryAllApis(buildPath, 20000);

      if (!data.success || !data.videos || data.videos.length === 0) {
        throw new Error("No car videos available right now");
      }

      const video = data.videos[0];
      const videoInfo = video.video_info || {};
      const downloads = video.downloads || [];

      if (downloads.length === 0) {
        throw new Error("No download links available");
      }

      // Try each download option until one works (handles 403 / expired links)
      let downloadedBuffer = null;
      let usedDownload = null;

      for (const download of downloads) {
        if (!download.url) continue;
        try {
          console.log("Trying download:", download.quality || "unknown");
          const videoResponse = await axios.get(download.url, {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxRedirects: 5,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': '*/*',
              'Referer': 'https://www.facebook.com/'
            }
          });
          downloadedBuffer = videoResponse.data;
          usedDownload = download;
          console.log("Download success:", download.quality || "unknown");
          break;
        } catch (dlErr) {
          console.log(`Download failed (${download.quality}):`, dlErr.message);
        }
      }

      if (!downloadedBuffer || !usedDownload) {
        throw new Error("All download links failed (403 / expired)");
      }

      const videoQuality = usedDownload.quality || "HD";
      const videoSize = usedDownload.size || "Unknown";

      // Save to temp file
      const tempPath = path.join(__dirname, `car_${Date.now()}.mp4`);
      fs.writeFileSync(tempPath, Buffer.from(downloadedBuffer));

      const stats = fs.statSync(tempPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      const duration = videoInfo.duration || "Unknown";

      const messageBody =
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏱ Duration : ${duration}\n` +
        `🔧 API      : ${base}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔥 Real aura doesn't need speed — it owns the road.\n` +
        `⚡ Powered by ShadowX-API`;

      // Unsend loading message after sending
      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      await message.reply({
        body: messageBody,
        attachment: fs.createReadStream(tempPath)
      });

      // Cleanup
      setTimeout(() => {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}
      }, 5000);

    } catch (error) {
      console.error("Car video error:", error);

      try {
        if (loadingMsg && loadingMsg.messageID) {
          await api.unsendMessage(loadingMsg.messageID);
        }
      } catch (e) {}

      let errorMessage = `🚧 Aura lost the signal\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (error.response) {
        errorMessage += `• API Error: ${error.response.status}\n`;
      } else if (error.request) {
        errorMessage += `• Network Error\n`;
        errorMessage += `• Check internet connection\n`;
      } else {
        errorMessage += `• ${error.message.substring(0, 80)}\n`;
      }

      errorMessage += `\n🔁 Try again later, driver`;

      await message.reply(errorMessage);
    }
  }
};
