import express from "express";

const app = express();
app.use(express.json());

const CHANNEL_USERNAME = "@paidtechzone"; // <-- Your channel to join

app.post("/api/bot", async (req, res) => {
  const update = req.body;
  console.log("Update received:", JSON.stringify(update, null, 2));

  if (!update.message || !update.message.text) {
    return res.status(200).send("no message");
  }

  const chat_id = update.message.chat.id;
  const user_id = update.message.from.id;
  const userText = update.message.text.trim();

  try {
    // First: check if user is member of the channel
    const isMember = await checkUserInChannel(user_id);
    if (!isMember) {
      const joinMsg = `🚫 You must join our channel *${CHANNEL_USERNAME}* to use this bot.\n` +
        `Please join and try again.`;
      await sendTelegramMessage(chat_id, joinMsg, { parse_mode: "Markdown" });
      return res.status(200).send("user not in channel");
    }

    // Handle /start with fancy styled welcome
    if (userText === "/start") {
      const welcome = 
        "👋 𝒲𝑒𝓁𝒸𝑜𝓂𝑒 𝓉𝑜 *𝙂𝑒𝓂𝒾𝓃𝒾 𝔹𝑜𝓉*!\n\n" +
        "✨ Send me any message, and I'll reply with AI magic from Gemini.\n\n" +
        `📢 But first, make sure you have joined our channel: ${CHANNEL_USERNAME}`;
      await sendTelegramMessage(chat_id, welcome, { parse_mode: "Markdown" });
      return res.status(200).send("started");
    }

    // Send 'typing...' action
    await sendTelegramAction(chat_id, "typing");

    // Call Gemini API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyA6pjtVRAfhxNqRpEA7Tvp6VdePc4oVT6k`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: userText }
            ]
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      await sendTelegramMessage(chat_id, "❌ Gemini API error:\n" + errorText);
      return res.status(200).send("gemini error");
    }

    const data = await response.json();

    let rawReply = data.candidates?.[0]?.content || "Sorry, no reply from Gemini.";

    // Clean and format reply
    const formattedReply = formatGeminiReply(rawReply);

    // Send the reply as Markdown, with code block if HTML detected
    if (looksLikeHtml(formattedReply)) {
      await sendTelegramMessage(chat_id, `📝 Here's your code snippet:\n\n\`\`\`html\n${escapeMarkdown(formattedReply)}\n\`\`\``, { parse_mode: "Markdown" });
    } else {
      await sendTelegramMessage(chat_id, `🤖 *Gemini Bot Reply:*\n\n${escapeMarkdown(formattedReply)}`, { parse_mode: "Markdown" });
    }

  } catch (err) {
    console.error("Error:", err);
    await sendTelegramMessage(chat_id, `⚠️ Oops, something went wrong:\n${escapeMarkdown(err.message || err.toString())}`);
  }

  res.status(200).send("ok");
});

// Check if user joined the channel
async function checkUserInChannel(userId) {
  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember`;
    const res = await fetch(`${url}?chat_id=${CHANNEL_USERNAME}&user_id=${userId}`);
    const json = await res.json();
    if (!json.ok) return false;
    const status = json.result.status;
    return ["member", "creator", "administrator"].includes(status);
  } catch {
    return false;
  }
}

// Send chat action (typing, upload_photo, etc)
async function sendTelegramAction(chat_id, action) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, action }),
  });
}

// Escape Markdown special chars
function escapeMarkdown(text) {
  return text
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(//g, "\")
    .replace(//g, "\")
    .replace(//g, "\")
    .replace(//g, "\")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/-/g, "\\-")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
}

// Detect if reply looks like HTML code
function looksLikeHtml(text) {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

// Format raw Gemini reply: remove JSON wrappers if any
function formatGeminiReply(raw) {
  // If response looks like JSON with parts, try parse and join text parts
  try {
    const parsed = JSON.parse(raw);
    if (parsed.parts && Array.isArray(parsed.parts)) {
      return parsed.parts.map(p => p.text).join("\n");
    }
  } catch {
    // not JSON, return raw
  }
  // fallback: return raw as is
  return raw;
}

async function sendTelegramMessage(chat_id, text, options = {}) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, ...options }),
  });
}

export default app;
