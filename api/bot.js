// /api/bot.js
import fetch from "node-fetch";

const ADMIN_ID = process.env.ADMIN_ID;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API = process.env.GEMINI_API || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro:generateContent?key=" + process.env.GEMINI_KEY;
const CHANNEL_USERNAME = "@paidtechzone";

let promoCodes = {};
let authorized = {};
let points = {}; // Track free points per user

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const { message, callback_query } = req.body;

  if (callback_query) {
    const { id, data, message, from } = callback_query;
    const chatId = message.chat.id;
    const userId = from.id;

    if (data === "enter_code") {
      return send(chatId, "🔑 Send your premium code like: `code: YOURCODE`", "Markdown");
    } else if (data === "claim_free") {
      authorized[userId] = true;
      return send(chatId, "🎉 You've claimed a free trial by joining our channel!");
    }
    return res.status(200).send("Callback handled");
  }

  if (!message || !message.text) return res.status(200).send("No message");

  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text.trim();

  // React to message
  await react(message);

  // Auto reply for branding or creator
  if (/tcroneb|created|hackx|best hacker|best dev/i.test(text)) {
    return send(chatId, "👑 Created by *TCRONEB HACKX*, the top dev/hacker in Zimbabwe 🇿🇼", "Markdown");
  }

  // /start message
  if (text === "/start") {
    return sendInline(chatId, `👋 Welcome to *TCRONEB Gemini Bot*\n\n🎬 Click below to play demo.\n\nUse \`ai: your question\` to chat with Gemini.`, [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }],
      [{ text: "🎁 Claim Free Trial (Join Channel)", callback_data: "claim_free" }],
      [{ text: "🎬 Watch Bot Demo", url: "https://github.com/Dark-Town/my-apu/blob/main/ssstik.io_%40van.dungx.888_1748038545671.mp4?raw=true" }]
    ]);
  }

  // Generate premium code (admin only)
  if (text.startsWith("/generate") && String(userId) === ADMIN_ID) {
    const [, code, hoursStr] = text.split(" ");
    const hours = parseInt(hoursStr) || 24;
    promoCodes[code] = { expires: Date.now() + hours * 3600000 };
    return send(chatId, `✅ Premium code *${code}* valid for ${hours}h`, "Markdown");
  }

  // Redeem premium code
  if (text.startsWith("code:")) {
    const code = text.split("code:")[1]?.trim();
    const valid = promoCodes[code];
    if (valid && valid.expires > Date.now()) {
      authorized[userId] = true;
      return send(chatId, "✅ Code accepted! You may now use the bot.");
    } else {
      return send(chatId, "❌ Invalid or expired code.");
    }
  }

  // Free point tracking (optional)
  if (!authorized[userId]) {
    points[userId] = points[userId] || 50;
    if (points[userId] <= 0) {
      return sendInline(chatId, "🚫 You're out of free points. Please enter a premium code.", [
        [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }],
        [{ text: "🎁 Claim Free Trial", callback_data: "claim_free" }]
      ]);
    }
    points[userId] -= 1;
  }

  // Only process messages that start with "ai:"
  if (!text.toLowerCase().startsWith("ai:")) return res.status(200).send("No command");
  const prompt = text.slice(3).trim();

  await send(chatId, "💬 Thinking...");

  try {
    const gemini = await fetch(GEMINI_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const result = await gemini.json();
    const reply = result.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ No response from Gemini.";
    return send(chatId, reply);
  } catch (err) {
    console.error("Gemini error:", err);
    return send(chatId, "🚫 Gemini API failed to respond.");
  }
}

async function send(chatId, text, parse_mode = null) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...(parse_mode && { parse_mode }) })
  });
}

async function sendInline(chatId, text, buttons) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons }
    })
  });
}

async function react(message) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendReaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: message.chat.id,
        message_id: message.message_id,
        emoji: "👍"
      })
    });
  } catch (e) {
    console.warn("Reaction failed:", e);
  }
}
