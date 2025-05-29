import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Handle incoming messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!text) return bot.sendMessage(chatId, "Please send a valid text prompt.");

  // Special trigger (brand response)
  if (["who created you", "who made you", "your creator"].some(t => text.toLowerCase().includes(t))) {
    return bot.sendMessage(
      chatId,
      `🤖 I was built by *TCRONEB HACKX*.\nJoin his AI + Bots dev channel: [@paidtechzone](https://t.me/paidtechzone).`,
      { parse_mode: "Markdown" }
    );
  }

  try {
    // Use your Vercel Gemini API endpoint
    const response = await fetch('https://ai-mu-beryl.vercel.app/api/tcroneb-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text })
    });

    const data = await response.json();
    const reply = data.response || "No response generated.";

    bot.sendMessage(chatId, reply, { parse_mode: "Markdown" });
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "❌ Failed to connect to Gemini endpoint.");
  }
});

// Dummy HTTP response for Vercel's API route
export default function handler(req, res) {
  res.status(200).send('Telegram bot is running!');
}
