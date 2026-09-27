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
      console.log("🎭 Trying Cosplay API:", url);
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
    name: 'cosplay',
    aliases: ['cos', 'animegirl'],
    version: '3.1',
    author: 'Mueid Mursalin Rifat',
    countDown: 5,
    role: 0,
    shortDescription: '✨ Get cosplay images',
    longDescription: '🌸 Send beautiful random cosplay pictures',
    category: 'image',
    guide: {
      en: '{pn} [number] (1-10)\n\nExample:\n{pn} 3 → get 3 images'
    }
  },

  onStart: async function ({ api, event, args }) {
    let waitingMsg = null;

    try {
      // Default = 1 image, max = 10
      let count = 1;

      if (args[0]) {
        const num = parseInt(args[0]);
        if (num > 0 && num <= 10) {
          count = num;
        } else {
          return api.sendMessage(
            `⚠️ Oops! Please choose a number between 1 and 10.\n\n` +
            `📌 Example:\n` +
            `• .cosplay 1\n` +
            `• .cosplay 10`,
            event.threadID,
            event.messageID
          );
        }
      }

      // Loading message
      const loadingEmojis = ['✨', '🌸', '🌟', '💫', '🎀', '💖', '🦋'];
      const randomEmoji = loadingEmojis[Math.floor(Math.random() * loadingEmojis.length)];
      waitingMsg = await api.sendMessage(
        `${randomEmoji} Fetching ${count} cosplay image${count > 1 ? 's' : ''}...\n⏳ Please wait a moment~`,
        event.threadID
      );

      // Fetch via rotating mirrors
      const buildPath = `/api/cs?count=${count}`;
      const { data, base } = await tryAllApis(buildPath, 15000);

      if (!data.success || !data.images || !data.images.length) {
        throw new Error('No images found 😢');
      }

      // Convert to streams
      const streams = [];
      const imageCount = Math.min(count, data.images.length);

      for (let i = 0; i < imageCount; i++) {
        try {
          const image = data.images[i];
          const stream = await global.utils.getStreamFromURL(image.url);
          streams.push(stream);
        } catch (e) {
          console.log('Image error:', e.message);
        }
      }

      if (!streams.length) {
        throw new Error('Failed to load images 😢');
      }

      // Random success emoji
      const successEmojis = ['🌸', '💖', '🌟', '🎀', '🦋'];
      const successEmoji = successEmojis[Math.floor(Math.random() * successEmojis.length)];

      // Build message
      let message = '';
      if (streams.length === 1) {
        message = `${successEmoji} Here's a cosplay image for you!🎀 \n`;
      } else {
        message = `${successEmoji} Here are ${streams.length} cosplay images!💖\n`;
      }

      message += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `🎀 Enjoy the cosplay collection!\n`;
      message += `🔧 API     : ${base}`;

      // Send images
      await api.sendMessage({
        body: message,
        attachment: streams
      }, event.threadID);

      // ✅ Delete "Fetching..." message immediately after sending images
      try {
        if (waitingMsg && waitingMsg.messageID) {
          await api.deleteMessage(waitingMsg.messageID);
        }
      } catch (e) {
        console.log('Could not delete waiting message:', e.message);
      }

      return;

    } catch (error) {
      console.error(error);

      try {
        if (waitingMsg && waitingMsg.messageID) {
          await api.deleteMessage(waitingMsg.messageID);
        }
      } catch (e) {}

      const errorEmojis = ['😢', '⚠️', '💔', '🌀', '😿'];
      const errorEmoji = errorEmojis[Math.floor(Math.random() * errorEmojis.length)];
      return api.sendMessage(
        `${errorEmoji} Error: ${error.message}\n\n` +
        `📌 Try again with:\n` +
        `• .cosplay 1\n` +
        `• .cosplay 5`,
        event.threadID,
        event.messageID
      );
    }
  }
};
