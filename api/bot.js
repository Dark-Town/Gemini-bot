// /api/bot.js - Telegram Gemini Bot with OpenAI and Premium Code System import fetch from "node-fetch";

const ADMIN_ID = process.env.ADMIN_ID; // Your Telegram user ID const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let promoCodes = {};  // { code: { expires: timestamp } } let authorized = {};  // { userId: true }

export default async function handler(req, res) { if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

const body = req.body; const msg = body.message; const cb = body.callback_query;

if (cb) { const chatId = cb.message.chat.id; const userId = cb.from.id; const data = cb.data;

if (data === "enter_code") {
  await send(chatId, "🔑 Send your premium code like:\n\n`code: YOURCODE`", "Markdown");
}

return res.status(200).send("Callback handled");

}

if (!msg || !msg.text) return res.status(200).send("No message");

const chatId = msg.chat.id; const userId = msg.from.id; const text = msg.text.trim();

if (text === "/start") { await send(chatId, 👋 *Welcome to TCRONEB ASSISTANT!*\n\n🤖 Powered by OpenAI\n🎥 Created by TCRONEB HACKX\n📺 Join @paidtechzone for updates., "Markdown");

// Play GitHub video
await sendVideo(chatId, "https://github.com/Dark-Town/my-apu/raw/main/ssstik.io_%40van.dungx.888_1748038545671.mp4");

return sendInline(chatId, "👇 Use the button below to enter your premium code.", [
  [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }]
]);

}

if (text.startsWith("/generate") && String(userId) === ADMIN_ID) { const [, code, hoursStr] = text.split(" "); const hours = parseInt(hoursStr) || 24; const expires = Date.now() + hours * 3600000; promoCodes[code] = { expires }; return send(chatId, ✅ Premium code *${code}* valid for ${hours} hours., "Markdown"); }

if (text.startsWith("code:")) { const input = text.split("code:")[1]?.trim(); const match = promoCodes[input];

if (match && match.expires > Date.now()) {
  authorized[userId] = true;
  return send(chatId, "✅ Code accepted. You may now chat with Gemini.");
} else {
  return send(chatId, "❌ Invalid or expired code. Try again.");
}

}

if (!authorized[userId]) { return sendInline(chatId, "🚫 You must enter a premium code to use Gemini.", [ [{ text: "🔐 Enter Premium Code", callback_data: "enter_code" }] ]); }

// 🤖 Auto response for special queries const lowered = text.toLowerCase(); if (lowered.includes("who created") || lowered.includes("your creator")) { return send(chatId, "👨‍💻 I was created by TCRONEB HACKX — the best hacker/dev in Zimbabwe!", "Markdown"); } if (lowered.includes("best dev") || lowered.includes("best hacker")) { return send(chatId, "👑 Without a doubt: TCRONEB HACKX!", "Markdown"); }

await send(chatId, "⏳ Thinking...");

try { const ai = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": Bearer ${OPENAI_API_KEY} }, body: JSON.stringify({ model: "gpt-4", messages: [ { role: "system", content: "You are Gemini bot built by TCRONEB HACKX." }, { role: "user", content: text } ] }) });

const result = await ai.json();
const reply = result.choices?.[0]?.message?.content || "⚠️ No response from Gemini.";

return send(chatId, reply);

} catch (err) { console.error("OpenAI error:", err); return send(chatId, "🚫 Gemini API failed to respond."); } }

async function send(chatId, text, parse_mode = null) { return await fetch(https://api.telegram.org/bot${BOT_TOKEN}/sendMessage, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, ...(parse_mode && { parse_mode }) }) }); }

async function sendInline(chatId, text, buttons) { return await fetch(https://api.telegram.org/bot${BOT_TOKEN}/sendMessage, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } }) }); }

async function sendVideo(chatId, videoUrl) { return await fetch(https://api.telegram.org/bot${BOT_TOKEN}/sendVideo, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, video: videoUrl }) }); }

