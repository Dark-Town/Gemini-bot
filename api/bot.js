// Telegram bot using OpenAI GPT-4 with premium code access, welcome buttons, and branding
import fetch from "node-fetch";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ADMIN_ID = process.env.ADMIN_ID;

let promoCodes = {};  // { code: { expires: timestamp } }
let authorized = {};  // { userId: true }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const body = req.body;
  const msg = body.message;
  const cb = body.callback_query;

  if (cb) {
    const chatId = cb.message.chat.id;
    const userId = cb.from.id;
    const data = cb.data;

    if (data === "enter_code") {
      await send(chatId, "🔑 Send your premium code like:\n\n`code: YOURCODE`", "Markdown");
    }

    if (data === "bot_info") {
      await send(chatId, `🤖 This bot was created by *TCRONEB HACKX*\n📺 YouTube: @paidtechzone`, "Markdown");
    }

    if (data === "watch_video") {
      await sendVideo(chatId, "https://github.com/Dark-Town/my-apu/blob/main/ssstik.io_%40van.dungx.888_1748038545671.mp4?raw=true");
    }

    return res.status(200).send("Callback handled");
  }

  if (!msg || !msg.text) return res.status(200).send("No message");

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();

  // Welcome /start
  if (text === "/start") {
    return sendInline(chatId, `👋 *Welcome to TCRONEB Gemini AI Bot!*\n\nJoin [@paidtechzone](https://t.me/paidtechzone) to learn more.`, [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }],
      [{ text: "📺 Watch Bot Video", callback_data: "watch_video" }],
      [{ text: "ℹ️ Bot Info", callback_data: "bot_info" }]
    ]);
  }

  // Admin generates code
  if (text.startsWith("/generate") && String(userId) === ADMIN_ID) {
    const [, code, hoursStr] = text.split(" ");
    const hours = parseInt(hoursStr) || 24;
    const expires = Date.now() + hours * 3600000;
    promoCodes[code] = { expires };
    return send(chatId, `✅ Premium code *${code}* valid for ${hours} hours.`, "Markdown");
  }

  // User sends code
  if (text.startsWith("code:")) {
    const input = text.split("code:")[1]?.trim();
    const match = promoCodes[input];

    if (match && match.expires > Date.now()) {
      authorized[userId] = true;
      return send(chatId, "✅ Code accepted! You may now chat with Gemini.");
    } else {
      return send(chatId, "❌ Invalid or expired code.");
    }
  }

  // Access check
  if (!authorized[userId]) {
    return sendInline(chatId, "🚫 You must enter a premium code to use Gemini.", [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }]
    ]);
  }

  // Auto-reaction
  await send(chatId, "✍️ Thinking...");

  // Check for special replies
  const lowered = text.toLowerCase();
  if (lowered.includes("who created you") || lowered.includes("your creator")) {
    return send(chatId, "👑 I was created by *TCRONEB HACKX*, Zimbabwe's finest dev/hacker! 💻", "Markdown");
  }

  if (lowered.includes("who is the best hacker") || lowered.includes("best dev in zimbabwe")) {
    return send(chatId, "🔥 *TCRONEB HACKX* is the top dev and hacker in Zimbabwe!", "Markdown");
  }

  // Use OpenAI GPT-4
  try {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: text }]
      })
    });

    const result = await aiRes.json();
    const reply = result.choices?.[0]?.message?.content || "⚠️ No response from AI.";
    return send(chatId, reply);
  } catch (e) {
    console.error("OpenAI error:", e);
    return send(chatId, "🚫 Gemini API failed to respond.");
  }
}

async function send(chatId, text, parse_mode = null) {
  return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(parse_mode && { parse_mode })
    })
  });
}

async function sendInline(chatId, text, buttons) {
  return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: buttons
      }
    })
  });
}

async function sendVideo(chatId, videoUrl) {
  return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      video: videoUrl,
      caption: "🎬 Watch how this bot works!",
      parse_mode: "Markdown"
    })
  });
}
