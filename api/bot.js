import fetch from "node-fetch";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

let promoCodes = {};   // { code: { expires } }
let authorized = {};   // { userId: true }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { message, callback_query } = req.body;

  if (callback_query) {
    const chatId = callback_query.message.chat.id;
    const userId = callback_query.from.id;
    const data = callback_query.data;

    if (data === "enter_code") {
      await send(chatId, "🔐 Send your premium code like:\n\n`code: YOURCODE`", "Markdown");
    }

    return res.status(200).send("Callback handled");
  }

  if (!message || !message.text) return res.status(200).send("No text");

  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text.trim();

  if (text === "/start") {
    return sendInline(chatId, `👋 *Welcome to TCRONEB Gemini Bot*\n\n🚀 I was created by TCRONEB.\nJoin [@paidtechzone](https://t.me/paidtechzone) & use a valid premium code.`, [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }]
    ]);
  }

  if (text.startsWith("/generate") && String(userId) === ADMIN_ID) {
    const [, code, hoursStr] = text.split(" ");
    const hours = parseInt(hoursStr || "24");
    promoCodes[code] = { expires: Date.now() + hours * 3600000 };
    return send(chatId, `✅ Premium code *${code}* valid for ${hours} hours.`, "Markdown");
  }

  if (text.toLowerCase().startsWith("code:")) {
    const codeInput = text.split("code:")[1]?.trim();
    const match = promoCodes[codeInput];

    if (match && match.expires > Date.now()) {
      authorized[userId] = true;
      return send(chatId, "✅ Code accepted. You may now use Gemini.");
    } else {
      return send(chatId, "❌ Invalid or expired code.");
    }
  }

  if (!authorized[userId]) {
    return sendInline(chatId, "🚫 You must enter a premium code to use Gemini.", [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }]
    ]);
  }

  await send(chatId, "✍️ Thinking...");

  try {
    const gemini = await fetch("https://gemini-bot-paidtech.vercel.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }]
      })
    });

    const result = await gemini.json();
    const reply = result.text || "⚠️ No response from Gemini.";

    return send(chatId, reply);
  } catch (err) {
    console.error("Gemini fetch error:", err);
    return send(chatId, "🚫 Gemini API failed to respond.");
  }
}

async function send(chatId, text, parse_mode = null) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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
