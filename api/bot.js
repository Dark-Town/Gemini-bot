import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send({ message: 'Only POST requests allowed' });
  }

  const body = req.body;

  // Extract Telegram chat ID and message text
  const chatId = body.message?.chat.id;
  const text = body.message?.text?.trim();

  if (!chatId || !text) {
    return res.status(200).send("No valid message");
  }

  // Special reply when asked about creator
  if (["who created you", "your creator", "who made you"].some(q => text.toLowerCase().includes(q))) {
    return await sendMessage(chatId, `🤖 I was created by *TCRONEB HACKX*.\nJoin: [@paidtechzone](https://t.me/paidtechzone)`, "Markdown");
  }

  try {
    const response = await fetch("https://gemini-bot-paidtech.vercel.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
    });

    const data = await response.json();
    const reply = data.text || "⚠️ Gemini didn't respond.";

    await sendMessage(chatId, reply);
    return res.status(200).send("Sent");
  } catch (err) {
    console.error("Gemini API Error:", err);
    await sendMessage(chatId, "🚫 Gemini API failed to respond.");
    return res.status(500).send("Error");
  }
}

async function sendMessage(chatId, text, parse_mode = null) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(parse_mode && { parse_mode }),
    }),
  });
}
