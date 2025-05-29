import fetch from "node-fetch";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

let promoCodes = {}; // { code: { expires } }
let authorized = {}; // { userId: true }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const update = req.body;

  // Handle callback queries first
  if (update.callback_query) {
    const chatId = update.callback_query.message.chat.id;
    const userId = update.callback_query.from.id;
    const data = update.callback_query.data;

    // Answer callback query to remove loading state
    await answerCallbackQuery(update.callback_query.id);

    if (data === "enter_code") {
      await sendMessage(chatId, "🔐 Send your premium code like:\n\n`code: YOURCODE`", "Markdown");
    }

    return res.status(200).send("OK");
  }

  // Handle messages
  if (!update.message || !update.message.text) return res.status(200).send("No text message");

  const chatId = update.message.chat.id;
  const userId = update.message.from.id;
  const text = update.message.text.trim();

  // Send 'typing...' action immediately
  sendChatAction(chatId, "typing").catch(() => {});

  if (text === "/start") {
    await sendInlineKeyboard(chatId,
      "👋 *Welcome to TCRONEB Gemini Bot*\n\nJoin [@paidtechzone](https://t.me/paidtechzone) & enter your premium code.",
      [[{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }]]
    );
    return res.status(200).send("OK");
  }

  if (text.startsWith("/generate") && String(userId) === ADMIN_ID) {
    const parts = text.split(" ");
    if (parts.length < 2) {
      await sendMessage(chatId, "❗ Usage: /generate CODE [hours]");
      return res.status(200).send("OK");
    }
    const code = parts[1];
    const hours = parseInt(parts[2]) || 24;
    const expires = Date.now() + hours * 3600000;
    promoCodes[code] = { expires };
    await sendMessage(chatId, `✅ Premium code *${code}* valid for ${hours} hours.`, "Markdown");
    return res.status(200).send("OK");
  }

  if (text.toLowerCase().startsWith("code:")) {
    const inputCode = text.split("code:")[1].trim();
    const promo = promoCodes[inputCode];
    if (promo && promo.expires > Date.now()) {
      authorized[userId] = true;
      await sendMessage(chatId, "✅ Code accepted. You may now chat with Gemini.");
    } else {
      await sendMessage(chatId, "❌ Invalid or expired code. Try again.");
    }
    return res.status(200).send("OK");
  }

  if (!authorized[userId]) {
    await sendInlineKeyboard(chatId,
      "🚫 You must enter a premium code to use Gemini.",
      [[{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }]]
    );
    return res.status(200).send("OK");
  }

  // User authorized, process Gemini API call
  await sendChatAction(chatId, "typing");

  try {
    const geminiResponse = await fetch("https://gemini-bot-paidtech.vercel.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: text }] })
    });

    const data = await geminiResponse.json();
    const reply = data.text || "⚠️ No response from Gemini.";
    await sendMessage(chatId, reply);
  } catch (error) {
    console.error("Gemini API error:", error);
    await sendMessage(chatId, "🚫 Gemini API failed to respond.");
  }

  res.status(200).send("OK");
}

// Send message helper
async function sendMessage(chatId, text, parse_mode = null) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(parse_mode ? { parse_mode } : {})
    })
  });
}

// Send message with inline keyboard helper
async function sendInlineKeyboard(chatId, text, inline_keyboard) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard }
    })
  });
}

// Send typing action helper
async function sendChatAction(chatId, action) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action
    })
  });
}

// Answer callback query to remove loading spinner
async function answerCallbackQuery(callbackQueryId) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}
