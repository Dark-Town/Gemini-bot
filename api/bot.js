import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CHANNEL_USERNAME = "yourchannelname"; // no @
const ADMIN_ID = 123456789; // your Telegram user id

// Store codes and temp access (in-memory for demo; use DB in prod)
const premiumCodes = {};
const tempAccessUsers = new Set();

function telegramApi(method, body) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => res.json());
}

async function getChannelPhoto() {
  try {
    const res = await telegramApi("getChat", { chat_id: `@${CHANNEL_USERNAME}` });
    if (!res.ok) return null;

    const photo = res.result.photo;
    if (!photo) return null;

    // Get biggest photo file_id
    const fileId = photo.big_file_id || photo.small_file_id;
    const fileRes = await telegramApi("getFile", { file_id: fileId });
    if (!fileRes.ok) return null;

    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileRes.result.file_path}`;
  } catch {
    return null;
  }
}

async function userIsMember(userId) {
  try {
    const res = await telegramApi("getChatMember", {
      chat_id: `@${CHANNEL_USERNAME}`,
      user_id: userId,
    });
    return ["member", "creator", "administrator"].includes(res.result.status);
  } catch {
    return false;
  }
}

function escapeHTML(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatBotReply(text) {
  // If looks like code (has < or > or HTML tags), send as quote
  if (/<\/?[a-z][\s\S]*>/i.test(text)) {
    return `📜 <pre>${escapeHTML(text)}</pre>`;
  }
  return text;
}

app.post("/api/bot", async (req, res) => {
  const update = req.body;

  if (!update.message) return res.sendStatus(200);
  const msg = update.message;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.trim() || "";

  // Handle /start command - send welcome with channel photo + buttons
  if (text === "/start") {
    const channelPhotoUrl = await getChannelPhoto();

    const welcomeText = `👋 Hello, ${msg.from.first_name}!\n\n` +
      `Welcome to this bot. To use it, please join our channel or enter a premium code.\n\n` +
      `Channel: @${CHANNEL_USERNAME}`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "✅ Join Channel", url: `https://t.me/${CHANNEL_USERNAME}` },
          { text: "🔑 Use Premium Code", callback_data: "use_premium" },
        ],
      ],
    };

    // Send photo if available
    if (channelPhotoUrl) {
      await telegramApi("sendPhoto", {
        chat_id: chatId,
        photo: channelPhotoUrl,
        caption: welcomeText,
        reply_markup: keyboard,
      });
    } else {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: welcomeText,
        reply_markup: keyboard,
      });
    }

    return res.sendStatus(200);
  }

  // Handle callback queries (buttons)
  if (update.callback_query) {
    const cb = update.callback_query;
    const cbData = cb.data;
    const cbChatId = cb.message.chat.id;
    const cbUserId = cb.from.id;

    if (cbData === "use_premium") {
      await telegramApi("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "Please send me your premium code now.",
        show_alert: false,
      });
      await telegramApi("sendMessage", {
        chat_id: cbChatId,
        text: "🔑 Send your premium code:",
      });
      return res.sendStatus(200);
    }

    if (cbData.startsWith("create_code")) {
      if (cbUserId !== ADMIN_ID) {
        await telegramApi("answerCallbackQuery", {
          callback_query_id: cb.id,
          text: "❌ Only admin can create premium codes.",
          show_alert: true,
        });
        return res.sendStatus(200);
      }
      await telegramApi("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "Send me the new premium code as a message.",
        show_alert: false,
      });
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  }

  // Check if user is admin creating code
  if (text.startsWith("/createcode ")) {
    if (userId !== ADMIN_ID) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "❌ You are not authorized to create premium codes.",
      });
      return res.sendStatus(200);
    }
    const code = text.split(" ")[1];
    if (!code) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "❌ Usage: /createcode yourcode",
      });
      return res.sendStatus(200);
    }
    if (premiumCodes[code]) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "❌ Code already exists.",
      });
      return res.sendStatus(200);
    }
    premiumCodes[code] = false; // not used yet
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: `✅ Premium code created: ${code}`,
    });
    return res.sendStatus(200);
  }

  // Check if user joined channel OR has temp access
  const isMember = await userIsMember(userId);
  const hasTempAccess = tempAccessUsers.has(userId);

  // Handle premium code usage (one-time)
  if (premiumCodes[text] === false) {
    premiumCodes[text] = true; // mark used
    tempAccessUsers.add(userId);

    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "✅ Premium code accepted! You have 10 seconds of access.",
    });

    setTimeout(() => {
      tempAccessUsers.delete(userId);
      telegramApi("sendMessage", {
        chat_id: chatId,
        text: "⌛ Your premium access has expired. Please join the channel or enter a new code.",
      });
    }, 10 * 1000);

    return res.sendStatus(200);
  } else if (premiumCodes[text] === true) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "❌ This premium code was already used.",
    });
    return res.sendStatus(200);
  }

  if (!isMember && !hasTempAccess) {
    // User must join or use code
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text:
        "❗ To use this bot, you must join our channel or enter a premium code.\n\n" +
        `Channel: https://t.me/${CHANNEL_USERNAME}`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Join Channel", url: `https://t.me/${CHANNEL_USERNAME}` },
            { text: "🔑 Use Premium Code", callback_data: "use_premium" },
          ],
        ],
      },
    });
    return res.sendStatus(200);
  }

  // User passed checks — show "typing" action
  await telegramApi("sendChatAction", { chat_id: chatId, action: "typing" });

  // Send user message to Gemini API
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
        }),
      }
    );
    const geminiJson = await geminiRes.json();

    if (!geminiRes.ok || !geminiJson.candidates || !geminiJson.candidates.length) {
      throw new Error("No response from Gemini API");
    }

    let botReply = geminiJson.candidates[0].output.content;
    if (typeof botReply === "object" && botReply.parts) {
      botReply = botReply.parts.map((p) => p.text).join("\n");
    }

    const formattedReply = formatBotReply(botReply);

    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: formattedReply,
      parse_mode: "HTML",
    });
  } catch (e) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "⚠️ Oops, something went wrong. Please try again later.",
    });
  }

  return res.sendStatus(200);
});

app.listen(3000, () => console.log("Bot running on port 3000"));

export default app;
