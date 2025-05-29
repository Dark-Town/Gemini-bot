// /api/bot.js - Telegram Gemini Bot with auto reaction
import fetch from "node-fetch";

const ADMIN_ID = process.env.ADMIN_ID; // Your Telegram user ID
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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

    return res.status(200).send("Callback handled");
  }

  if (!msg || !msg.text) return res.status(200).send("No message");

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();

  if (text === "/start") {
    return sendInline(chatId, `👋 Welcome to *TCRONEB Gemini Bot*\n\nJoin @paidtechzone & enter your code.`, [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }]
    ]);
  }

  if (text.startsWith("/generate") && String(userId) === ADMIN_ID) {
    const [, code, hoursStr] = text.split(" ");
    const hours = parseInt(hoursStr) || 24;
    const expires = Date.now() + hours * 3600000;
    promoCodes[code] = { expires };
    return send(chatId, `✅ Premium code *${code}* valid for ${hours} hours.`, "Markdown");
  }

  if (text.startsWith("code:")) {
    const input = text.split("code:")[1]?.trim();
    const match = promoCodes[input];

    if (match && match.expires > Date.now()) {
      authorized[userId] = true;
      return send(chatId, "✅ Code accepted. You may now chat with Gemini.");
    } else {
      return send(chatId, "❌ Invalid or expired code. Try again.");
    }
  }

  if (!authorized[userId]) {
    return sendInline(chatId, "🚫 You must enter a premium code to use Gemini.", [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }]
    ]);
  }

  // ✅ React to user message before Gemini
  await send(chatId, "✅ Processing...");

  try {
    const gemini = await fetch("https://gemini-bot-paidtech.vercel.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }]
      })
    });

    const data = await gemini.json();
    const reply = data.text || "⚠️ No response from Gemini.";

    return send(chatId, reply);
  } catch (e) {
    console.error("Gemini error:", e);
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
      reply_markup: { inline_keyboard: buttons }
    })
  });
}
