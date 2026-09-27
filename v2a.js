const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "v2a",
    aliases: ["video2audio", "videotoaudio", "extractaudio"],
    version: "3.1",
    author: "Mueid Mursalin Rifat",
    countDown: 10,
    role: 0,
    shortDescription: "Convert video to audio",
    longDescription: "Reply to a video to convert it to audio (mp3, m4a, aac)",
    category: "media",
    guide: {
      en: "{p}{n} [format]\nFormats: mp3, m4a, aac"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    let waitMsg = null;

    try {
      // Validate reply
      if (!event.messageReply || !event.messageReply.attachments || !event.messageReply.attachments.length) {
        return message.reply(
          `🎥 Please reply to a video message.\n` +
          `📌 Usage: v2a [format]\n` +
          `🎵 Formats: mp3, m4a, aac`
        );
      }

      const videoAttachment = event.messageReply.attachments[0];

      if (videoAttachment.type !== "video") {
        return message.reply("❌ The replied content must be a video.");
      }

      // Format
      const format = (args[0] || "mp3").toLowerCase();
      const allowedFormats = ["mp3", "m4a", "aac"];

      if (!allowedFormats.includes(format)) {
        return message.reply(`❌ Invalid format.\n🎵 Available: ${allowedFormats.join(", ")}`);
      }

      // Size check (50 MB)
      const fileSize = videoAttachment.size || 0;
      const maxSize = 50 * 1024 * 1024;

      if (fileSize > maxSize) {
        return message.reply(
          `❌ Video is too large.\n` +
          `📦 Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n` +
          `📏 Max: 50 MB`
        );
      }

      waitMsg = await message.reply(
        `⏳ Converting video to audio...\n` +
        `🎵 Format: ${format.toUpperCase()}\n` +
        `📦 Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n` +
        `⏱ Please wait...`
      );

      // Download video
      const { data } = await axios.get(videoAttachment.url, {
        responseType: "arraybuffer",
        timeout: 60000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });

      // Save
      const cacheDir = path.join(__dirname, "cache");
      fs.ensureDirSync(cacheDir);

      const outputPath = path.join(cacheDir, `v2a_${Date.now()}.${format}`);
      fs.writeFileSync(outputPath, Buffer.from(data));

      const stats = fs.statSync(outputPath);
      const outSize = (stats.size / 1024 / 1024).toFixed(2);

      // Send result
      await api.sendMessage(
        {
          body:
            `✅ Conversion complete!\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎵 Format: ${format.toUpperCase()}\n` +
            `📦 Size: ${outSize} MB\n` +
            ``,
          attachment: fs.createReadStream(outputPath)
        },
        event.threadID,
        event.messageID
      );

      // ✅ Unsend the "Converting..." message immediately after sending
      try {
        if (waitMsg && waitMsg.messageID) {
          await api.unsendMessage(waitMsg.messageID);
        }
      } catch (e) {
        console.log("Could not unsend wait message:", e.message);
      }

      // Cleanup file
      setTimeout(() => {
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) {}
      }, 5000);

    } catch (error) {
      console.error("Conversion error:", error);

      // Clean up wait message on error too
      try {
        if (waitMsg && waitMsg.messageID) {
          await api.unsendMessage(waitMsg.messageID);
        }
      } catch (e) {}

      let errorMessage = "❌ An error occurred while converting the video.";

      if (error.code === "ENOTFOUND") {
        errorMessage = "❌ Network error: cannot connect to server.";
      } else if (error.code === "ECONNABORTED") {
        errorMessage = "❌ Request timeout: video too large or server is slow.";
      } else if (error.response) {
        errorMessage = `❌ Server error: ${error.response.status} - ${error.response.statusText}`;
      }

      return message.reply(errorMessage);
    }
  }
};
