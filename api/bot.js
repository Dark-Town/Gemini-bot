export const config = {
  runtime: "edge",
};

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;
const premiumCodes = new Map();

function sendTelegram(method, data) {
  return fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

async function hasJoinedChannel(userId) {
  const res = await fetch(`${TELEGRAM_API}/getChatMember?chat_id=@${process.env.CHANNEL_USERNAME}&user_id=${userId}`);
  const data = await res.json();
  return data.result?.status === "member" || data.result?.status === "administrator";
}

async function getGeminiReply(text) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
    }),
  });
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Gemini API error.";
}

export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const update = await req.json();
  const message = update.message;
  if (!message) return new Response("No message");

  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text?.trim();

  // Typing indicator
  await sendTelegram("sendChatAction", { chat_id: chatId, action: "typing" });

  // Start command
  if (text === "/start") {
    return sendTelegram("sendMessage", {
      chat_id: chatId,
      text: `👋 Welcome! To use this bot you must either:\n\n✅ Join @${process.env.CHANNEL_USERNAME}\n🔑 Or enter a premium code.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Join Channel", url: `https://t.me/${process.env.CHANNEL_USERNAME}` }],
          [{ text: "🔑 Enter Premium Code", callback_data: "enter_code" }],
          ...(String(userId) === process.env.OWNER_ID ? [[{ text: "🛠 Create Premium Code", callback_data: "create_code" }]] : []),
        ],
      },
    });
  }

  // Handle callback queries
  if (update.callback_query) {
    const { data, message: cbMsg, from } = update.callback_query;

    if (data === "create_code" && String(from.id) === process.env.OWNER_ID) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      premiumCodes.set(code, Date.now() + 10000); // 10 sec
      return sendTelegram("sendMessage", {
        chat_id: from.id,
        text: `✅ Premium code generated: \`${code}\` (valid 10 seconds)`,
        parse_mode: "Markdown",
      });
    }

    if (data === "enter_code") {
      return sendTelegram("sendMessage", {
        chat_id: from.id,
        text: "🔑 Please enter your premium code.",
      });
    }

    return new Response("OK");
  }

  // Premium code check
  if (/^[A-Z0-9]{6}$/.test(text)) {
    const expiry = premiumCodes.get(text);
    if (expiry && expiry > Date.now()) {
      premiumCodes.delete(text);
      return sendTelegram("sendMessage", {
        chat_id: chatId,
        text: "✅ Premium code accepted! You may now use the bot.",
      });
    } else {
      return sendTelegram("sendMessage", {
        chat_id: chatId,
        text: "❌ Invalid or expired code.",
      });
    }
  }

  // Channel check
  const isOwner = String(userId) === process.env.OWNER_ID;
  const joined = await hasJoinedChannel(userId);
  if (!isOwner && !joined) {
    return sendTelegram("sendMessage", {
      chat_id: chatId,
      text: `🚫 You must either join our channel @${process.env.CHANNEL_USERNAME} or enter a valid premium code.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Join Channel", url: `https://t.me/${process.env.CHANNEL_USERNAME}` }],
          [{ text: "🔑 Enter Premium Code", callback_data: "enter_code" }],
        ],
      },
    });
  }

  // Get reply from Gemini
  const reply = await getGeminiReply(text);

  return sendTelegram("sendMessage", {
    chat_id: chatId,
    text: `🤖 *Gemini says:*\n\n${reply}`,
    parse_mode: "Markdown",
  });
}
