const axios = require("axios");

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
      console.log("🕌 Trying Namaz API:", url);
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
    name: 'namaz',
    aliases: ['salah', 'prayertime', 'salat'],
    version: '2.0',
    author: 'Mueid Mursalin Rifat',
    countDown: 5,
    role: 0,
    shortDescription: 'Get Islamic prayer times',
    longDescription: 'Get accurate prayer times for any city worldwide',
    category: 'info',
    guide: {
      en: '{pn} [city] [country]\nExample: {pn} Dhaka Bangladesh\n{pn} Riyadh Saudi Arabia\n{pn} Dubai UAE'
    }
  },

  onStart: async function ({ api, event, args }) {
    try {
      // No args → help
      if (args.length === 0) {
        return api.sendMessage(
          `🕌 𝐍𝐚𝐦𝐚𝐳 / 𝐒𝐚𝐥𝐚𝐡 𝐓𝐢𝐦𝐞𝐬\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 𝐔𝐬𝐚𝐠𝐞:\n` +
          `• ${this.config.name} [city] [country]\n\n` +
          `📚 𝐄𝐱𝐚𝐦𝐩𝐥𝐞𝐬:\n` +
          `• .namaz Dhaka Bangladesh\n` +
          `• .namaz New York USA\n` +
          `• .namaz London UK\n\n` +
          `🤲 May Allah accept your prayers!`,
          event.threadID,
          event.messageID
        );
      }

      let city, country;

      if (args.length >= 2) {
        const multiWordCountries = [
          "united kingdom", "united states", "united arab emirates",
          "saudi arabia", "south africa", "south korea", "new zealand",
          "north korea", "bosnia herzegovina", "czech republic"
        ];

        const argsLower = args.join(" ").toLowerCase();
        let foundCountry = "";

        for (const multiCountry of multiWordCountries) {
          if (argsLower.includes(multiCountry)) {
            foundCountry = multiCountry;
            const countryWords = multiCountry.split(" ").length;
            city = args.slice(0, -countryWords).join(" ");
            country = args.slice(-countryWords).join(" ");
            break;
          }
        }

        if (!foundCountry) {
          city = args.slice(0, -1).join(" ");
          country = args[args.length - 1];
        }
      } else {
        return api.sendMessage(
          `❌ Please specify both city and country.\n\n` +
          `📌 𝐂𝐨𝐫𝐫𝐞𝐜𝐭 𝐅𝐨𝐫𝐦𝐚𝐭:\n` +
          `• ${this.config.name} [city] [country]\n\n` +
          `📌 𝐄𝐱𝐚𝐦𝐩𝐥𝐞𝐬:\n` +
          `• ${this.config.name} ${args[0]} Bangladesh\n` +
          `• ${this.config.name} ${args[0]} Pakistan\n` +
          `• ${this.config.name} ${args[0]} USA`,
          event.threadID,
          event.messageID
        );
      }

      const waitingMsg = await api.sendMessage(
        `🕌 Fetching prayer times for ${city}, ${country}...\n⏳ Please wait...`,
        event.threadID,
        event.messageID
      );

      // Call API via rotating mirrors
      const buildPath = `/api/namaz?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}`;
      const { data, base } = await tryAllApis(buildPath, 15000);

      if (!data.status) {
        throw new Error("API returned an error response");
      }

      const timings = data.timings;
      const location = data.location;

      function getCurrentTime(timezone) {
        try {
          const now = new Date();
          return now.toLocaleTimeString('en-US', {
            timeZone: timezone || 'UTC',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
          });
        } catch {
          return "N/A";
        }
      }

      function getNextPrayer(currentTime, timings) {
        if (currentTime === "N/A") return null;

        const prayers = [
          { name: "Fajr", time: timings.Fajr, emoji: "🌅" },
          { name: "Dhuhr", time: timings.Dhuhr, emoji: "☀️" },
          { name: "Asr", time: timings.Asr, emoji: "⛅" },
          { name: "Maghrib", time: timings.Maghrib, emoji: "🌇" },
          { name: "Isha", time: timings.Isha, emoji: "🌙" }
        ];

        const [ch, cm] = currentTime.split(":").map(Number);
        const currentMinutes = ch * 60 + cm;

        for (const prayer of prayers) {
          const [ph, pm] = prayer.time.split(":").map(Number);
          const prayerMinutes = ph * 60 + pm;

          if (prayerMinutes > currentMinutes) {
            const left = prayerMinutes - currentMinutes;
            return {
              name: prayer.name,
              emoji: prayer.emoji,
              time: prayer.time,
              hoursLeft: Math.floor(left / 60),
              minutesLeft: left % 60
            };
          }
        }

        const [fh, fm] = timings.Fajr.split(":").map(Number);
        const fajrMinutes = fh * 60 + fm;
        const left = (24 * 60 - currentMinutes) + fajrMinutes;
        return {
          name: "Fajr",
          emoji: "🌅",
          time: timings.Fajr,
          hoursLeft: Math.floor(left / 60),
          minutesLeft: left % 60,
          isTomorrow: true
        };
      }

      const currentTime = getCurrentTime(location.timezone);
      const nextPrayer = currentTime !== "N/A" ? getNextPrayer(currentTime, timings) : null;

      // ---- Build message (clean, readable layout) ----
      let message = ``;
      message += `╔══════════════════════════════╗\n`;
      message += `║      🕌 𝐍𝐀𝐌𝐀𝐙 𝐓𝐈𝐌𝐄𝐒       ║\n`;
      message += `╚══════════════════════════════╝\n\n`;

      message += `📍 𝐋𝐨𝐜𝐚𝐭𝐢𝐨𝐧: ${data.city}, ${data.country}\n`;
      message += `📅 ${data.date} • ${data.weekday}\n`;
      message += `🌙 ${data.hijri} (${data.hijriMonth})\n`;
      if (currentTime !== "N/A") {
        message += `⏰ 𝐂𝐮𝐫𝐫𝐞𝐧𝐭 𝐓𝐢𝐦𝐞: ${currentTime}\n`;
      }
      message += `──────────────────────────────\n\n`;

      message += `🕋 𝐏𝐑𝐀𝐘𝐄𝐑 𝐓𝐈𝐌𝐄𝐒\n`;
      message += `┌──────────────────────────────┐\n`;
      message += `│ 🌅  Fajr      →  ${timings.Fajr.padEnd(8)}│\n`;
      message += `│ 🌄  Sunrise   →  ${timings.Sunrise.padEnd(8)}│\n`;
      message += `│ ☀️  Dhuhr     →  ${timings.Dhuhr.padEnd(8)}│\n`;
      message += `│ ⛅  Asr       →  ${timings.Asr.padEnd(8)}│\n`;
      message += `│ 🌇  Maghrib   →  ${timings.Maghrib.padEnd(8)}│\n`;
      message += `│ 🌙  Isha      →  ${timings.Isha.padEnd(8)}│\n`;
      message += `└──────────────────────────────┘\n\n`;

      message += `⏱ 𝐎𝐓𝐇𝐄𝐑 𝐓𝐈𝐌𝐄𝐒\n`;
      message += `├──────────────────────────────┤\n`;
      message += `│ Imsak        →  ${timings.Imsak.padEnd(10)}│\n`;
      message += `│ Midnight     →  ${timings.Midnight.padEnd(10)}│\n`;
      message += `│ 1st Third    →  ${timings.Firstthird.padEnd(10)}│\n`;
      message += `│ Last Third   →  ${timings.Lastthird.padEnd(10)}│\n`;
      message += `└──────────────────────────────┘\n\n`;

      if (nextPrayer) {
        message += `──────────────────────────────\n`;
        message += `🕌 𝐍𝐄𝐗𝐓 𝐏𝐑𝐀𝐘𝐄𝐑\n`;
        message += `┌──────────────────────────────┐\n`;
        if (nextPrayer.isTomorrow) {
          message += `│ ${nextPrayer.emoji}  ${nextPrayer.name} (Tomorrow)\n`;
          message += `│ ⏰ Time: ${nextPrayer.time}\n`;
          message += `│ ⏳ Remaining: ${nextPrayer.hoursLeft}h ${nextPrayer.minutesLeft}m\n`;
          message += `│ 💡 Night prayers are highly rewarded!\n`;
        } else {
          message += `│ ${nextPrayer.emoji}  ${nextPrayer.name}\n`;
          message += `│ ⏰ Time: ${nextPrayer.time}\n`;
          message += `│ ⏳ Remaining: ${nextPrayer.hoursLeft}h ${nextPrayer.minutesLeft}m\n`;

          const prayerTips = {
            "Fajr": "• Wake up for Tahajjud before Fajr",
            "Dhuhr": "• Take a break and remember Allah",
            "Asr": "• Don't delay Asr prayer",
            "Maghrib": "• Break fast if fasting",
            "Isha": "• Perfect time for night prayers"
          };
          if (prayerTips[nextPrayer.name]) {
            message += `│ ${prayerTips[nextPrayer.name]}\n`;
          }
        }
        message += `└──────────────────────────────┘\n\n`;
      }

      message += `──────────────────────────────\n`;
      message += `📍 𝐋𝐨𝐜𝐚𝐭𝐢𝐨𝐧 𝐈𝐧𝐟𝐨\n`;
      message += `• Coordinates: ${location.latitude.toFixed(4)}°N, ${location.longitude.toFixed(4)}°E\n`;
      message += `• Timezone: ${location.timezone}\n`;
      message += `• Calculation: ${location.method}\n\n`;

      message += `──────────────────────────────\n`;
      message += `📌 Note: Always verify with local mosque\n`;
      message += `🤲 May Allah accept our prayers (Ameen)\n`;
      message += `⚡ Powered by: ${data.operator || data.powered_by || "ShadowX-API"}\n`;
      message += `🔧 API: ${base}\n`;
      message += `──────────────────────────────`;

      try { await api.deleteMessage(waitingMsg.messageID); } catch {}
      return api.sendMessage(message, event.threadID, event.messageID);

    } catch (error) {
      console.error("Error fetching prayer times:", error);

      let errorMessage = `╔══════════════════════════════╗\n`;
      errorMessage += `║        ❌ 𝐄𝐑𝐑𝐎𝐑          ║\n`;
      errorMessage += `╚══════════════════════════════╝\n\n`;

      if (error.response) {
        errorMessage += `⚠️ API Error: ${error.response.status}\n`;
        if (error.response.status === 404) {
          errorMessage += `• Location not found\n`;
          errorMessage += `• Check city/country spelling\n`;
        }
      } else if (error.request) {
        errorMessage += `🌐 Network Error\n`;
        errorMessage += `• Could not reach server\n`;
        errorMessage += `• Check your internet\n`;
      } else {
        errorMessage += `🔧 Error: ${error.message}\n`;
      }

      errorMessage += `\n──────────────────────────────\n`;
      errorMessage += `📌 𝐂𝐨𝐫𝐫𝐞𝐜𝐭 𝐅𝐨𝐫𝐦𝐚𝐭:\n`;
      errorMessage += `• ${this.config.name} [city] [country]\n\n`;
      errorMessage += `📚 𝐏𝐨𝐩𝐮𝐥𝐚𝐫 𝐄𝐱𝐚𝐦𝐩𝐥𝐞𝐬:\n`;
      errorMessage += `┌──────────────────────────────┐\n`;
      errorMessage += `│ • .namaz Dhaka Bangladesh    │\n`;
      errorMessage += `│ • .namaz Karachi Pakistan    │\n`;
      errorMessage += `│ • .namaz London UK           │\n`;
      errorMessage += `└──────────────────────────────┘\n\n`;
      errorMessage += `🤲 Try again with correct format...`;

      return api.sendMessage(errorMessage, event.threadID, event.messageID);
    }
  }
};
