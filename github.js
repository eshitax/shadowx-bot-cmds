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
      console.log("🐙 Trying GitHub API:", url);
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
    name: 'github',
    aliases: ['githubinfo', 'gitinfo'],
    version: '3.0',
    author: 'Mueid Mursalin Rifat',
    countDown: 5,
    role: 0,
    shortDescription: 'Get GitHub user information',
    longDescription: 'Fetch GitHub profile information for any user',
    category: 'utility',
    guide: {
      en: '{pn} [username]\nExample: {pn} mueidmursalinrifat'
    }
  },

  onStart: async function ({ api, event, args }) {
    let waitingMsg = null;

    try {
      if (args.length === 0) {
        return api.sendMessage(
          `🐙 GitHub Info\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 Usage: .github [username]\n` +
          `📍 Example: .github mueidmursalinrifat`,
          event.threadID,
          event.messageID
        );
      }

      const username = args[0].trim();

      waitingMsg = await api.sendMessage(`🔍 Fetching ${username}...`, event.threadID, event.messageID);

      // Call API via rotating mirrors
      const buildPath = `/api/github?username=${encodeURIComponent(username)}`;
      const { data, base } = await tryAllApis(buildPath, 15000);

      if (!data.success) throw new Error("User not found");

      const user = data.user;

      function formatDaysAgo(days) {
        if (days < 30) return `${days} days`;
        if (days < 365) {
          const months = Math.floor(days / 30);
          return `${months} month${months > 1 ? 's' : ''}`;
        }
        const years = Math.floor(days / 365);
        const remainingMonths = Math.floor((days % 365) / 30);
        return `${years} year${years > 1 ? 's' : ''}${remainingMonths > 0 ? ` ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}` : ''}`;
      }

      // ---- Build message (simple typing, all info kept) ----
      let message = `╔══════════════════════════╗\n`;
      message += `║      🐙 GITHUB INFO      ║\n`;
      message += `╚══════════════════════════╝\n\n`;

      // Basic Info
      message += `👤 BASIC INFO\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📛 Name     : ${user.basic_info.name || user.basic_info.username}\n`;
      message += `🆔 Username : @${user.basic_info.username}\n`;
      message += `🔢 User ID  : ${user.basic_info.id}\n`;
      message += `📌 Type     : ${user.basic_info.type}\n`;
      if (user.basic_info.site_admin) message += `⭐ Admin    : Yes\n`;
      message += `\n`;

      // Profile Details
      message += `📝 PROFILE\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📖 Bio      : ${user.profile_details.bio || "No bio"}\n`;
      message += `🏢 Company  : ${user.profile_details.company || "None"}\n`;
      if (user.profile_details.blog && user.profile_details.blog !== 'Not provided') {
        message += `🌐 Website  : ${user.profile_details.blog}\n`;
      }
      if (user.profile_details.location && user.profile_details.location !== 'Not provided') {
        message += `📍 Location : ${user.profile_details.location}\n`;
      }
      if (user.profile_details.email && user.profile_details.email !== 'Not public') {
        message += `📧 Email    : ${user.profile_details.email}\n`;
      }
      if (user.profile_details.hireable) {
        message += `✅ Available for hire\n`;
      }
      if (user.profile_details.twitter_username && user.profile_details.twitter_username !== 'Not provided') {
        message += `🐦 Twitter  : @${user.profile_details.twitter_username}\n`;
      }
      message += `\n`;

      // Statistics
      message += `📊 STATS\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📚 Public Repos   : ${user.statistics.public_repos}\n`;
      message += `📄 Public Gists   : ${user.statistics.public_gists}\n`;
      message += `👥 Followers      : ${user.statistics.followers}\n`;
      message += `👣 Following      : ${user.statistics.following}\n`;
      if (user.statistics.private_repos > 0) {
        message += `🔒 Private Repos  : ${user.statistics.private_repos}\n`;
      }
      message += `\n`;

      // Account Info
      message += `📅 ACCOUNT\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📆 Created     : ${user.dates.created_at_formatted}\n`;
      message += `⏱️ Account Age : ${formatDaysAgo(user.dates.account_age_days)}\n`;
      message += `🔄 Updated     : ${new Date(user.dates.updated_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })}\n`;
      message += `\n`;

      // Links
      message += `🔗 LINKS\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `🔗 Profile   : ${user.basic_info.html_url}\n`;
      message += `📁 Repos     : ${user.basic_info.html_url}?tab=repositories\n`;
      message += `👥 Followers : ${user.basic_info.html_url}?tab=followers\n`;
      message += `\n`;

      // Footer
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `⚡ ${data.operator || "ShadowX"}\n`;
      message += `🔧 API : ${base}\n`;
      message += `🐙 ShadowX GitHub API`;

      await api.deleteMessage(waitingMsg.messageID);

      return api.sendMessage(
        {
          body: message,
          attachment: await global.utils.getStreamFromURL(user.basic_info.avatar_url)
        },
        event.threadID,
        event.messageID
      );

    } catch (error) {
      console.error('GitHub Error:', error);

      try {
        if (waitingMsg) await api.deleteMessage(waitingMsg.messageID);
      } catch (e) {}

      let errorMessage = `❌ Error\n`;
      errorMessage += `━━━━━━━━━━━━━━━━━━━━\n`;

      if (error.response?.status === 404) {
        errorMessage += `User "${args[0]}" not found\n`;
        errorMessage += `\n📌 Try: .github mueidmursalinrifat`;
      } else {
        errorMessage += `${error.message}\n`;
      }

      return api.sendMessage(errorMessage, event.threadID, event.messageID);
    }
  }
};
