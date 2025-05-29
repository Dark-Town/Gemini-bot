import fetch from "node-fetch";

let codes = {};         // { code: { expires: timestamp } }
let access = {};        // { userId: true }

const ADMIN_ID = process.env.ADMIN_ID;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API = "https://gemini-bot-paidtech.vercel.app/api/chat"; // Your POST endpoint

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Only POST");

  const body = req.body;
  const message = body.message;
  const callback = body.callback_query;

  if (callback) {
    const chatId = callback.message.chat.id;
    const userId = callback.from.id;
    const data = callback.data;

    if (data === "enter_code") {
      await sendMessage(chatId, "🔐 Please enter your premium code like this:\n\n`code: YOURCODE`", "Markdown");
    }

    return res.status(200).send("Callback handled");
  }

  if (!message || !message.text) return res.status(200).send("No message");

  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text.trim();

  // 🟢 Welcome
  if (text === "/start") {
    return await sendButtons(chatId, "👋 Welcome to *TCRONEB Gemini Bot*\n\nThis bot requires a premium code to use AI features.", [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }],
    ], res);
  }

  // 🛠 Admin: Generate premium code
  if (text.startsWith("/generate") && String(userId) === ADMIN_ID) {
    const [, code, hourStr] = text.split(" ");
    const hours = parseInt(hourStr) || 24;
    const expires = Date.now() + hours * 3600000;
    codes[code] = { expires };
    return await sendMessage(chatId, `✅ Code *${code}* created.\nExpires in ${hours} hours.`, "Markdown", res);
  }

  // 🔑 Code input
  if (text.startsWith("code:")) {
    const inputCode = text.split("code:")[1]?.trim();
    const match = codes[inputCode];

    if (match && match.expires > Date.now()) {
      access[userId] = true;
      return await sendMessage(chatId, "✅ Premium code accepted! You can now use the bot.", null, res);
    } else {
      return await sendMessage(chatId, "❌ Invalid or expired code. Please try again.", null, res);
    }
  }

  // 🚫 Require code
  if (!access[userId]) {
    return await sendButtons(chatId, "🔒 You need to enter a valid premium code first.", [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }],
    ], res);
  }

  // ✅ Send to Gemini API (POST)
  try {
    const geminiRes = await fetch(GEMINI_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }]
      })
    });

    const json = await geminiRes.json();
    const reply = json?.text || "⚠️ Gemini API returned no response.";
    return await sendMessage(chatId, reply, null, res);
  } catch (err) {
    console.error("Gemini Error:", err);
    return await sendMessage(chatId, "🚫 Gemini API failed to respond.", null, res);
  }
}

// 📩 Send message
async function sendMessage(chatId, text, parse_mode = null, res = null) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...(parse_mode && { parse_mode }) }),
  });
  if (res) res.status(200).send("OK");
}

// 🔘 Inline button
async function sendButtons(chatId, text, buttons, res) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: buttons },
      parse_mode: "Markdown"
    }),
  });
  res.status(200).send("OK");
}
