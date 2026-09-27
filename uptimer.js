const axios = require("axios");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "uptimerdb.json");
const ADMIN_UID = "100051869042398";
const CHECK_INTERVAL = 60 * 1000;     // 1 min
const MAX_FAILURES = 5;
const REQUEST_TIMEOUT = 10000;

// -------------------- DB HELPERS --------------------

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "{}", "utf-8");
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8") || "{}");
  } catch (e) {
    console.error("DB load error:", e.message);
    return {};
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("DB save error:", e.message);
  }
}

// -------------------- TIME HELPERS --------------------

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m`;
}

function getDhakaTime() {
  return new Date().toLocaleString("en-US", {
    timeZone: "Asia/Dhaka",
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function uptimePercent(uptime, checks) {
  if (!checks) return "0.0";
  return ((uptime / checks) * 100).toFixed(1);
}

// -------------------- URL CHECKER --------------------

async function checkURL(url) {
  try {
    const res = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      validateStatus: () => true,
      headers: {
        "User-Agent": "Mozilla/5.0 (ShadowX-Uptimer)"
      }
    });
    return {
      up: res.status >= 200 && res.status < 400,
      status: res.status,
      time: Date.now()
    };
  } catch {
    return { up: false, status: 0, time: Date.now() };
  }
}

// -------------------- MODULE --------------------

module.exports = {
  config: {
    name: "uptimer",
    aliases: ["uptime", "monitor"],
    version: "3.0",
    author: "Mueid Mursalin Rifat",
    role: 0,
    shortDescription: "Monitor website uptime",
    longDescription: "Track website uptime per user with alerts and summary.",
    category: "utility",
    guide: {
      en: `
{pn} add <url>       - Add a URL to monitor
{pn} remove <url>    - Remove a monitored URL
{pn} notify on/off   - Enable/disable notifications
{pn} status          - View your monitored URLs
{pn} check <url>     - One-time check (no monitoring)
{pn} all             - (Admin) View all monitored URLs`
    }
  },

  onStart: async function ({ args, message, event }) {
    const uid = event.senderID;
    const db = loadDB();
    const subcmd = (args[0] || "").toLowerCase();

    // Ensure user record exists
    if (!db[uid]) db[uid] = { notify: true, monitors: {} };
    if (!db[uid].monitors) db[uid].monitors = {};

    // ---------------- HELP ----------------
    if (!subcmd || subcmd === "help") {
      return message.reply(
        `📡 UPTIMER — Commands\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `➕ add <url>       → Add URL to monitor\n` +
        `➖ remove <url>    → Remove a URL\n` +
        `🔔 notify on/off  → Toggle alerts\n` +
        `📊 status         → View your monitors\n` +
        `🔍 check <url>    → One-time check\n` +
        `📋 all            → (Admin) All monitors\n\n` +
        `💡 Example: .uptimer add https://google.com`
      );
    }

    // ---------------- ADD ----------------
    if (subcmd === "add") {
      const url = args[1];
      if (!url || !/^https?:\/\//i.test(url)) {
        return message.reply("❌ Please provide a valid URL starting with http:// or https://");
      }

      if (db[uid].monitors[url]) {
        return message.reply(`⚠️ Already monitoring:\n🔗 ${url}`);
      }

      db[uid].monitors[url] = {
        addedAt: Date.now(),
        checks: 0,
        uptime: 0,
        downtime: 0,
        lastStatus: "Unknown",
        lastCheck: null,
        lastCode: null,
        failures: 0
      };
      saveDB(db);

      const result = await checkURL(url);
      const statusText = result.up ? "🟢 UP" : "🔴 DOWN";
      return message.reply(
        `✅ Now monitoring:\n🔗 ${url}\n⚡ Initial check: ${statusText} (code: ${result.status})\n` +
        `⏱ First auto-check runs within 1 minute.`
      );
    }

    // ---------------- REMOVE ----------------
    if (subcmd === "remove" || subcmd === "delete" || subcmd === "del") {
      const url = args[1];
      if (!url) return message.reply("❌ Usage: .uptimer remove <url>");
      if (!db[uid].monitors[url]) {
        return message.reply(`⚠️ Not being monitored:\n🔗 ${url}`);
      }
      delete db[uid].monitors[url];
      saveDB(db);
      return message.reply(`🗑️ Removed from monitoring:\n🔗 ${url}`);
    }

    // ---------------- NOTIFY ----------------
    if (subcmd === "notify") {
      const opt = (args[1] || "").toLowerCase();
      if (!["on", "off"].includes(opt)) {
        return message.reply("⚠️ Usage: .uptimer notify on | off");
      }
      db[uid].notify = opt === "on";
      saveDB(db);
      return message.reply(`🔔 Notifications ${opt.toUpperCase()}!`);
    }

    // ---------------- STATUS ----------------
    if (subcmd === "status") {
      const monitors = Object.entries(db[uid].monitors);
      if (!monitors.length) {
        return message.reply("❌ You're not monitoring any URLs yet.\n💡 Try: .uptimer add https://example.com");
      }

      const lines = monitors.map(([url, d]) => {
        const status =
          d.lastStatus === "up" ? "🟢 UP" :
          d.lastStatus === "down" ? "🔴 DOWN" :
          "⚪ UNKNOWN";
        const code = d.lastCode ? ` (HTTP ${d.lastCode})` : "";
        const pct = uptimePercent(d.uptime, d.checks);
        return (
          `🌐 URL: ${url}\n` +
          `⚡ Status: ${status}${code}\n` +
          `📊 Checks: ${d.checks} | 📈 Uptime: ${pct}% | ❌ Down: ${d.downtime}\n` +
          `⏰ Last check: ${d.lastCheck || "Never"} (Asia/Dhaka)\n` +
          `⏱ Monitored for: ${formatTime(Date.now() - d.addedAt)}\n` +
          `⚠️ Failures: ${d.failures}/${MAX_FAILURES}`
        );
      });

      const header =
        `📡 UPTIME STATUS\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔔 Notifications: ${db[uid].notify ? "ON" : "OFF"}\n` +
        `📦 Total monitors: ${monitors.length}\n\n`;

      return message.reply(header + lines.join("\n\n"));
    }

    // ---------------- ONE-TIME CHECK ----------------
    if (subcmd === "check") {
      const url = args[1];
      if (!url || !/^https?:\/\//i.test(url)) {
        return message.reply("❌ Usage: .uptimer check <url>");
      }
      const start = Date.now();
      const result = await checkURL(url);
      const latency = Date.now() - start;
      const statusText = result.up ? "🟢 UP" : "🔴 DOWN";
      return message.reply(
        `🔍 Check Result\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 URL: ${url}\n` +
        `⚡ Status: ${statusText}\n` +
        `📶 HTTP Code: ${result.status || "N/A"}\n` +
        `⏱ Latency: ${latency}ms`
      );
    }

    // ---------------- ALL (ADMIN) ----------------
    if (subcmd === "all") {
      if (uid !== ADMIN_UID) return message.reply("❌ Admin only command.");

      const users = Object.entries(db).filter(([, u]) => Object.keys(u.monitors || {}).length);
      if (!users.length) return message.reply("📋 No monitors in the database.");

      const total = users.reduce((sum, [, u]) => sum + Object.keys(u.monitors).length, 0);

      const body = users.map(([userId, u]) => {
        const list = Object.entries(u.monitors).map(([url, d]) => {
          const icon = d.lastStatus === "up" ? "🟢" : d.lastStatus === "down" ? "🔴" : "⚪";
          const pct = uptimePercent(d.uptime, d.checks);
          return `  ${icon} ${url}  (${pct}%)`;
        }).join("\n");
        return `👤 User: ${userId}\n${list}`;
      }).join("\n\n");

      return message.reply(
        `📋 ALL MONITORS\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 Users: ${users.length} | 🌐 URLs: ${total}\n\n` +
        body
      );
    }

    return message.reply("❓ Unknown subcommand. Use `.uptimer help`.");
  }
};

// -------------------- BACKGROUND MONITOR --------------------

let monitorRunning = false;

setInterval(async () => {
  if (monitorRunning) return; // prevent overlap
  monitorRunning = true;

  try {
    const db = loadDB();
    let changed = false;

    for (const [uid, userData] of Object.entries(db)) {
      if (!userData.monitors) continue;

      for (const [url, data] of Object.entries(userData.monitors)) {
        const result = await checkURL(url);

        data.checks++;
        data.lastCheck = getDhakaTime();
        data.lastCode = result.status || 0;

        if (result.up) {
          data.uptime++;
          data.failures = 0;
          data.lastStatus = "up";
        } else {
          data.downtime++;
          data.failures++;
          data.lastStatus = "down";

          if (userData.notify && global.api?.sendMessage) {
            try {
              await global.api.sendMessage(
                `❗ ALERT\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `🔴 URL DOWN\n` +
                `🌐 ${url}\n` +
                `📶 Code: ${result.status || "N/A"}\n` +
                `⚠️ Failures: ${data.failures}/${MAX_FAILURES}\n` +
                `⏰ ${data.lastCheck} (Asia/Dhaka)`,
                uid
              );
            } catch (e) {
              console.error("Notify error:", e.message);
            }
          }

          if (data.failures >= MAX_FAILURES) {
            delete userData.monitors[url];
            if (userData.notify && global.api?.sendMessage) {
              try {
                await global.api.sendMessage(
                  `⛔ AUTO-REMOVED\n🌐 ${url}\nReason: ${MAX_FAILURES} consecutive failures.`,
                  uid
                );
              } catch (e) {}
            }
          }
        }
        changed = true;
      }
    }

    if (changed) saveDB(db);
  } catch (e) {
    console.error("Monitor loop error:", e.message);
  } finally {
    monitorRunning = false;
  }
}, CHECK_INTERVAL);
