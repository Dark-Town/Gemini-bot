import fetch from "node-fetch";

let codes = {}; // Store { code: { expires: timestamp } }
let userAccess = {}; // Store userId: true if allowed

const ADMIN_ID = process.env.ADMIN_ID; // Your Telegram user ID

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("POST only");

  const msg = req.body.message;
  if (!msg || !msg.chat || !msg.chat.id) return res.status(200).send("No chat");

  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = msg.text?.trim() || "";

  // 🟢 New user - welcome and button
  if (text === "/start") {
    return sendButtons(chatId, "👋 Welcome to TCRONEB Gemini AI!\n\nTo use the bot, enter a Premium Code.", [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }],
    ], res);
  }

  // 🛠 Admin code generator: /generate CODE 24
  if (text.startsWith("/generate") && userId == ADMIN_ID) {
    const [, code, hoursStr] = text.split(" ");
    const hours = parseInt(hoursStr) || 24;
    const expires = Date.now() + hours * 60 * 60 * 1000;
    codes[code] = { expires };
    return sendMessage(chatId, `✅ Premium code *${code}* added. Expires in ${hours}h.`, "Markdown", res);
  }

  // 🔐 Code entry by user
  if (text.startsWith("code:")) {
    const input = text.split("code:")[1]?.trim();
    const code = codes[input];
    if (code && code.expires > Date.now()) {
      userAccess[userId] = true;
      return sendMessage(chatId, "✅ Premium code accepted. You may now chat with Gemini!", null, res);
    }
    return sendMessage(chatId, "❌ Invalid or expired code. Try again.", null, res);
  }

  // 🚫 Block unless user is premium
  if (!userAccess[userId]) {
    return sendButtons(chatId, "🔒 Please enter a premium code to continue.", [
      [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }],
    ], res);
  }

  // 🤖 Handle regular messages
  try {
    const geminiRes = await fetch("https://gemini-bot-paidtech.vercel.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
    });

    const data = await geminiRes.json();
    const reply = data.text || "⚠️ Gemini didn't respond.";

    return sendMessage(chatId, reply, null, res);
  } catch (err) {
    console.error("Gemini Error:", err);
    return sendMessage(chatId, "🚫 Gemini API failed to respond.", null, res);
  }
}

// 📩 Helper: Send message
async function sendMessage(chatId, text, parse_mode = null, res) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...(parse_mode && { parse_mode }) }),
  });
  res.status(200).send("OK");
}

// 🔘 Helper: Send buttons
async function sendButtons(chatId, text, buttons, res) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: buttons },
    }),
  });
  res.status(200).send("OK");
}
