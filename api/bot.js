import fetch from "node-fetch";

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CHANNEL_USERNAME = "paidtechzone"; // your channel username without @
const ADMIN_ID = 123456789; // your Telegram user ID (number)

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let tempAccessUsers = new Map(); // userId => expiry timestamp
let premiumCodes = new Map(); // premiumCode => expiry timestamp

async function telegramApi(method, data) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function userIsMember(userId) {
  try {
    const res = await fetch(
      `${TELEGRAM_API}/getChatMember?chat_id=@${CHANNEL_USERNAME}&user_id=${userId}`
    );
    const data = await res.json();
    return (
      data.ok &&
      ["member", "administrator", "creator"].includes(data.result.status)
    );
  } catch {
    return false;
  }
}

async function getChannelPhoto() {
  try {
    const res = await fetch(`${TELEGRAM_API}/getChat?chat_id=@${CHANNEL_USERNAME}`);
    const data = await res.json();
    if (data.ok && data.result.photo) {
      const fileId = data.result.photo.big_file_id || data.result.photo.small_file_id;
      const fileRes = await fetch(
        `${TELEGRAM_API}/getFile?file_id=${fileId}`
      );
      const fileData = await fileRes.json();
      if (fileData.ok) {
        return `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
      }
    }
  } catch {}
  return null;
}

async function generateGeminiReply(text) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
        }),
      }
    );
    const data = await res.json();
    if (data.candidates?.length > 0) {
      return data.candidates[0].content.parts.map(p => p.text).join("\n");
    } else if (data.error) {
      return `Error from Gemini API: ${data.error.message}`;
    }
    return "No response from Gemini.";
  } catch {
    return "Failed to contact Gemini API.";
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const body = req.body;
  const message = body.message || body.callback_query?.message;
  if (!message) return res.status(200).send("No message");

  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || "";

  const now = Date.now();
  // Cleanup expired accesses
  for (const [u, exp] of tempAccessUsers) if (exp < now) tempAccessUsers.delete(u);
  for (const [c, exp] of premiumCodes) if (exp < now) premiumCodes.delete(c);

  if (body.callback_query) {
    const data = body.callback_query.data;

    if (data === "use_premium") {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "Please enter your premium code now. You will get 10 seconds access if code is valid.",
      });
      return res.status(200).send("OK");
    }

    if (data.startsWith("create_code_")) {
      if (userId !== ADMIN_ID) {
        await telegramApi("answerCallbackQuery", {
          callback_query_id: body.callback_query.id,
          text: "You are not authorized to create premium codes.",
          show_alert: true,
        });
        return res.status(200).send("OK");
      }
      const code = data.split("_")[2];
      premiumCodes.set(code, now + 10 * 1000); // 10 seconds validity
      await telegramApi("answerCallbackQuery", {
        callback_query_id: body.callback_query.id,
        text: `Premium code "${code}" created for 10 seconds.`,
      });
      return res.status(200).send("OK");
    }

    return res.status(200).send("OK");
  }

  if (text === "/start") {
    const channelPhotoUrl = await getChannelPhoto();

    const welcomeText = `👋 Welcome to Gemini Bot!\n\n` +
      `Please join our channel @${CHANNEL_USERNAME} or enter a premium code to use the bot.\n\nPowered by Gemini AI.`;

    if (channelPhotoUrl) {
      await telegramApi("sendPhoto", {
        chat_id: chatId,
        photo: channelPhotoUrl,
        caption: welcomeText,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Join Channel", url: `https://t.me/${CHANNEL_USERNAME}` },
              { text: "🔑 Use Premium Code", callback_data: "use_premium" },
            ],
          ],
        },
      });
    } else {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: welcomeText,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Join Channel", url: `https://t.me/${CHANNEL_USERNAME}` },
              { text: "🔑 Use Premium Code", callback_data: "use_premium" },
            ],
          ],
        },
      });
    }
    return res.status(200).send("OK");
  }

  // Admin always allowed
  const isAdmin = userId === ADMIN_ID;
  const isMember = await userIsMember(userId);
  const hasTempAccess = tempAccessUsers.has(userId);

  if (!isAdmin && !isMember && !hasTempAccess) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: `🚫 You must join our channel @${CHANNEL_USERNAME} or enter a valid premium code.\nChoose below:`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Join Channel", url: `https://t.me/${CHANNEL_USERNAME}` },
            { text: "🔑 Use Premium Code", callback_data: "use_premium" },
          ],
        ],
      },
    });
    return res.status(200).send("OK");
  }

  // Check if user just sent a premium code
  if (premiumCodes.has(text)) {
    tempAccessUsers.set(userId, now + 10 * 1000); // 10 seconds access
    premiumCodes.delete(text);
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "✅ Premium code accepted! You have 10 seconds access to use the bot.",
    });
    return res.status(200).send("OK");
  }

  // If temp access expired during conversation
  if (hasTempAccess && tempAccessUsers.get(userId) < now) {
    tempAccessUsers.delete(userId);
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "⏰ Your premium access expired. Please join the channel or enter a new premium code.",
    });
    return res.status(200).send("OK");
  }

  // Show typing action
  await telegramApi("sendChatAction", {
    chat_id: chatId,
    action: "typing",
  });

  // Generate Gemini reply
  const reply = await generateGeminiReply(text);

  // Format HTML code blocks nicely
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(reply);
  const formatted = hasHtml
    ? `📄 <code>${reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`
    : reply;

  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: formatted,
    parse_mode: hasHtml ? "HTML" : undefined,
  });

  return res.status(200).send("OK");
        }
