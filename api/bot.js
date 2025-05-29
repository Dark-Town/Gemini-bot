// /api/bot.js - Telegram Gemini Bot with premium, points, referrals, and message control
import fetch from "node-fetch";

const ADMIN_ID = process.env.ADMIN_ID;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let promoCodes = {};   // { code: { expires: timestamp } }
let authorized = {};   // { userId: true }
let userPoints = {};   // { userId: points }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const body = req.body;
  const msg = body.message;
  const cb = body.callback_query;

  const getUserId = () => (cb ? cb.from.id : msg?.from?.id);
  const getChatId = () => (cb ? cb.message.chat.id : msg?.chat?.id);

  const userId = getUserId();
  const chatId = getChatId();
  const text = msg?.text?.trim();

  // Handle callback buttons
  if (cb) {
    const data = cb.data;

    if (data === "enter_code") {
      await send(chatId, "🔑 Send your premium code like:\n\n`code: YOURCODE`", "Markdown");
    }

    if (data === "claim_50_points") {
      userPoints[userId] = (userPoints[userId] || 0) + 50;
      return send(chatId, "🎁 You've received *50 free points*! Enjoy using the bot.", "Markdown");
    }

    if (data === "join_channel") {
      authorized[userId] = true;
      return send(chatId, "✅ Thanks for joining the channel! You now have full access.");
    }

    return res.status(200).send("Callback handled");
  }

  // Message handler
  if (!msg || !text) return res.status(200).send("No message");

  if (text === "/start") {
    return sendInline(chatId, `👋 *Welcome to TCRONEB Gemini Bot*\n\n⚙️ Use AI, generate code, or get help.\n\nCreated by *TCRONEB HACKX* — Zimbabwe’s top dev and hacker.`, [
      [
        { text: "🔐 Enter Premium Code", callback_data: "enter_code" },
        { text: "📢 Join Channel (1 Month Free)", callback_data: "join_channel" }
      ],
      [
        { text: "💎 Claim 50 Points", callback_data: "claim_50_points" }
      ],
      [
        { text: "▶️ Watch Bot Demo", url: "https://github.com/Dark-Town/my-apu/blob/main/ssstik.io_%40van.dungx.888_1748038545671.mp4" }
      ]
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

  // Auto-like emoji reaction
  if (msg?.message_id && msg?.chat?.type !== "private") {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendReaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: msg.message_id,
        emoji: "👍"
      })
    });
  }

  // Keyword responses
  const lower = text.toLowerCase();
  if (lower.includes("tcroneb hackx") || lower.includes("who created you") || lower.includes("best hacker")) {
    return send(chatId, "🤖 I was created by *TCRONEB HACKX*, the top developer & hacker in Zimbabwe!", "Markdown");
  }

  // Check access
  const points = userPoints[userId] || 0;
  const isPremium = authorized[userId];
  if (!isPremium && points <= 0) {
    return sendInline(chatId, "🚫 You must enter a premium code or claim points.", [
      [{ text: "🔐 Enter Code", callback_data: "enter_code" }, { text: "💎 Claim 50 Points", callback_data: "claim_50_points" }]
    ]);
  }

  // Deduct a point if not premium
  if (!isPremium) userPoints[userId] = points - 1;

  // Manual trigger only
  if (!text.startsWith("ai:")) return res.status(200).send("Skip: not a prompt");

  const prompt = text.replace("ai:", "").trim();
  await send(chatId, "✅ Processing your request...");

  try {
    const gemini = await fetch("https://gemini-bot-paidtech.vercel.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: prompt }] })
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
    body: JSON.stringify({ chat_id: chatId, text, ...(parse_mode && { parse_mode }) })
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
