import fetch from "node-fetch";

const BOT_TOKEN = process.env.BOT_TOKEN; // Your bot token here
const CHANNEL_USERNAME = "paidtechzone"; // Your channel username without @
const ADMIN_ID = 123456789; // Your Telegram user ID as number
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let tempAccessUsers = new Map(); // userId => expiry timestamp

// Helper: send Telegram API requests
async function telegramApi(method, data) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

// Helper: check if user joined channel
async function userIsMember(userId) {
  try {
    const res = await fetch(
      `${TELEGRAM_API}/getChatMember?chat_id=@${CHANNEL_USERNAME}&user_id=${userId}`
    );
    const data = await res.json();
    if (
      data.ok &&
      ["member", "administrator", "creator"].includes(data.result.status)
    )
      return true;
  } catch (e) {}
  return false;
}

// Helper: get channel photo URL
async function getChannelPhoto() {
  try {
    const res = await fetch(
      `${TELEGRAM_API}/getChat?chat_id=@${CHANNEL_USERNAME}`
    );
    const data = await res.json();
    if (data.ok && data.result.photo) {
      const fileId = data.result.photo.big_file_id || data.result.photo.small_file_id;
      // Get file path
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

// Gemini API call to generate content
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
    if (data.candidates && data.candidates.length > 0) {
      // Gemini returns { parts: [{ text }] }
      return data.candidates[0].content.parts
        .map((p) => p.text)
        .join("\n");
    } else if (data.error) {
      return `Error from Gemini API: ${data.error.message}`;
    }
    return "No response from Gemini.";
  } catch (e) {
    return "Failed to contact Gemini API.";
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Only POST allowed");
  const body = req.body;

  const message = body.message || body.callback_query?.message;
  if (!message) return res.status(200).send("No message");

  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || "";

  // Handle callback_query buttons
  if (body.callback_query) {
    const data = body.callback_query.data;
    if (data === "use_premium") {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text:
          "Please enter your premium code now. You will get 10 seconds access if code is valid.",
      });
      return res.status(200).send("OK");
    }
    if (data.startsWith("create_code_")) {
      // Admin creating a premium code
      if (userId !== ADMIN_ID) {
        await telegramApi("answerCallbackQuery", {
          callback_query_id: body.callback_query.id,
          text: "You are not authorized to create premium codes.",
          show_alert: true,
        });
        return res.status(200).send("OK");
      }
      const code = data.split("_")[2];
      // Store code in memory with expiry (let’s keep simple)
      premiumCodes.set(code, Date.now() + 10 * 1000); // 10 seconds validity
      await telegramApi("answerCallbackQuery", {
        callback_query_id: body.callback_query.id,
        text: `Premium code "${code}" created and valid for 10 seconds.`,
      });
      return res.status(200).send("OK");
    }
    return res.status(200).send("OK");
  }

  // Temporary in-memory premium codes store
  if (typeof global.premiumCodes === "undefined") {
    global.premiumCodes = new Map();
  }
  const premiumCodes = global.premiumCodes;

  // Clean expired codes
  for (const [code, expiry] of premiumCodes.entries()) {
    if (expiry < Date.now()) premiumCodes.delete(code);
  }

  // Command: /start
  if (text === "/start") {
    const channelPhotoUrl = await getChannelPhoto();

    let welcomeText = `👋 Welcome to the Gemini Bot!\n\n` +
      `Please join our channel @${CHANNEL_USERNAME} to use this bot or enter a premium code.\n\n` +
      `You can also ask me anything powered by Gemini AI.`;

    // Send welcome message with photo and buttons
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

  // Check if user is admin
  const isAdmin = userId === ADMIN_ID;

  // Check user membership
  const isMember = await userIsMember(userId);

  // Check if user has temp access
  const hasTempAccess = tempAccessUsers.has(userId);

  // If user sent a message that looks like a premium code
  if (premiumCodes.has(text)) {
    tempAccessUsers.set(userId, Date.now() + 10 * 1000); // 10 seconds
    premiumCodes.delete(text);
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: `✅ Premium code accepted! You have 10 seconds to use the bot.`,
    });
    return res.status(200).send("OK");
  }

  if (!isAdmin && !isMember && !hasTempAccess) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text:
        `🚫 You must either join our channel @${CHANNEL_USERNAME} or enter a valid premium code.\nChoose below:`,
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

  // Remove expired temp access
  if (hasTempAccess && tempAccessUsers.get(userId) < Date.now()) {
    tempAccessUsers.delete(userId);
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "⏰ Your premium access expired. Please join the channel or enter a new code.",
    });
    return res.status(200).send("OK");
  }

  // Send typing action while waiting Gemini reply
  await telegramApi("sendChatAction", {
    chat_id: chatId,
    action: "typing",
  });

  // Get Gemini reply
  let reply = await generateGeminiReply(text);

  // Format reply: if contains HTML tags, wrap in quotes
  if (/<\/?[a-z][\s\S]*>/i.test(reply)) {
    reply = `📄 <code>${reply
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</code>`;
  }

  // Send reply message
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: reply,
    parse_mode: "HTML",
  });

  return res.status(200).send("OK");
        }
