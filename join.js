module.exports = {
  config: {
    name: "join",
    version: "3.1",
    author: "Mueid Mursalin Rifat",
    countDown: 3,
    role: 2,
    description: {
      en: "Show groups bot joined and let user join by reply"
    },
    category: "utility"
  },

  onStart: async function ({ api, event, args }) {
    try {
      // Fetch threads ONCE
      let threads;
      try {
        threads = await api.getThreadList(200, null, ["INBOX"]);
      } catch (e) {
        // fallback attempt with GROUP filter if API behaves differently
        console.log("getThreadList primary failed, trying fallback:", e);
        threads = await api.getThreadList(200, null, ["GROUP"]);
      }

      if (!threads || !Array.isArray(threads))
        return api.sendMessage("❌ Error: could not fetch thread list (invalid response). Check logs.", event.threadID);

      const groups = threads.filter(t => t.isGroup);

      if (args[0] === "search") {
        const keyword = args.slice(1).join(" ").trim();
        if (!keyword) return api.sendMessage("❗ Usage: .join search <name or tid>", event.threadID);

        const found = groups.filter(g =>
          (g.name && g.name.toLowerCase().includes(keyword.toLowerCase())) ||
          (g.threadID && g.threadID.includes(keyword))
        );

        if (found.length === 0) return api.sendMessage("🔎 No matching groups found.", event.threadID);

        let text = `🔍 Search results for "${keyword}":\n\n`;
        const list = [];

        for (let i = 0; i < found.length; i++) {
          const g = found[i];
          const members = Array.isArray(g.participantIDs) ? g.participantIDs.length : "N/A";
          text += `${i + 1}. ${g.name || "No name"}\nTID: ${g.threadID}\nMembers: ${members}\n\n`;
          list.push({ name: g.name, threadID: g.threadID, members });
        }

        api.sendMessage(text + "Reply with the number to be added.", event.threadID, (err, info) => {
          if (err) {
            console.log("sendMessage error (search):", err);
            return api.sendMessage("❌ Failed to send results (see console).", event.threadID);
          }
          global.GoatBot.onReply.set(info.messageID, {
            commandName: module.exports.config.name,
            author: event.senderID,
            list
          });
        });

        return;
      }

      // PAGE MODE
      const perPage = 20;
      const page = Math.max(1, parseInt(args[0]) || 1);
      const totalPages = Math.max(1, Math.ceil(groups.length / perPage));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * perPage;
      const pageGroups = groups.slice(start, start + perPage);

      if (pageGroups.length === 0) return api.sendMessage("⚠️ No groups to show on this page.", event.threadID);

      let text = `📋 Groups Bot Joined (Page ${safePage}/${totalPages})\n\n`;
      const list = [];

      pageGroups.forEach((g, i) => {
        const members = Array.isArray(g.participantIDs) ? g.participantIDs.length : "N/A";
        text += `${i + 1}. ${g.name || "No name"}\nTID: ${g.threadID}\nMembers: ${members}\n\n`;
        list.push({ name: g.name, threadID: g.threadID, members });
      });

      text += `➡️ Reply with the number to join that group. Use ".join ${safePage + 1}" for next page.`;

      api.sendMessage(text, event.threadID, (err, info) => {
        if (err) {
          console.log("sendMessage page error:", err);
          return api.sendMessage("❌ Failed to send group list (see console).", event.threadID);
        }
        // register reply handler
        global.GoatBot.onReply.set(info.messageID, {
          commandName: module.exports.config.name,
          author: event.senderID,
          list
        });
      });

    } catch (err) {
      console.log("Unhandled onStart error in join.js:", err);
      return api.sendMessage("❌ Something went wrong! Check bot console for details.", event.threadID);
    }
  },

  onReply: async function ({ api, event, Reply }) {
    try {
      if (!Reply || event.senderID !== Reply.author) return api.sendMessage("❌ You cannot use this reply.", event.threadID);

      const text = (event.body || "").trim();
      const num = parseInt(text, 10);
      if (isNaN(num)) return api.sendMessage("⚠️ Please reply with a valid number.", event.threadID);

      const index = num - 1;
      if (!Reply.list || !Reply.list[index]) return api.sendMessage("⚠️ Invalid selection.", event.threadID);

      const target = Reply.list[index];

      // quick check using the group data we stored (fast)
      if (!target.threadID) return api.sendMessage("❌ Target thread ID missing.", event.threadID);

      // Check if the user is already in that group (best-effort)
      try {
        const info = await api.getThreadInfo(target.threadID);
        if (Array.isArray(info.participantIDs) && info.participantIDs.includes(event.senderID)) {
          return api.sendMessage(`ℹ️ You are already in "${info.threadName || target.name}".`, event.threadID);
        }
      } catch (e) {
        // Non-fatal: continue — some APIs may block getThreadInfo for certain threads
        console.log("getThreadInfo (onReply) warning:", e);
      }

      // Now try to add the user. Use callback to be sure of result.
      api.addUserToGroup(event.senderID, target.threadID, (err) => {
        if (err) {
          console.log("addUserToGroup error:", err);
          // More helpful error messages for common causes:
          const msg = (err && err.message) ? err.message.toLowerCase() : "";
          if (msg.includes("permissions") || msg.includes("require") || msg.includes("admin")) {
            return api.sendMessage("❌ Failed to add you: the bot lacks permission to add members to that group.", event.threadID);
          }
          if (msg.includes("not friend") || msg.includes("friend")) {
            return api.sendMessage("❌ Failed to add you: the bot may require you to be friends or accept a request.", event.threadID);
          }
          return api.sendMessage("❌ Failed to add you to the group. See console for details.", event.threadID);
        }
        return api.sendMessage(`✅ Successfully added you to "${target.name}"`, event.threadID);
      });

    } catch (err) {
      console.log("Unhandled onReply error in join.js:", err);
      return api.sendMessage("❌ Something went wrong while processing your reply. Check console.", event.threadID);
    }
  }
};
