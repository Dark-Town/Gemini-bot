import fetch from "node-fetch";

const premiumCodes = new Map(); // code -> used (bool)
const userSessions = new Map(); // userId -> expiresAt timestamp

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || "@paidtechzone";
const OWNER_ID = Number(process.env.OWNER_ID);

async function sendTelegram(method, data) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error(`Telegram API error (${method}):`, json);
  }
  return json;
}

async function getChannelPhoto() {
  try {
    // Get channel info with photos
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${CHANNEL_USERNAME}`);
    const data = await res.json();
    if (data.ok && data.result.photo) {
      const photos = data.result.photo; // array of photo sizes
      const biggest = photos[photos.length - 1];
      // get file path
      const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${biggest.file_id}`);
      const fileData = await fileRes.json();
      if (fileData.ok) {
        return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
      }
    }
  } catch (e) {
    console.warn("getChannelPhoto error:", e.message);
  }
  return null;
}

async function checkUserInChannel(userId) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChatMember?chat_id=${CHANNEL_USERNAME}&user_id=${userId}`);
    const data = await res.json();
    if (!data.ok) return false;
    const status = data.result.status;
    return ["member", "administrator", "creator"].includes(status);
  } catch {
    return false;
  }
}

function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

function looksLikeHtml(text) {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

function formatGeminiReply(raw) {
  // raw might be an object or string
  if (typeof raw === "string") return raw.trim();

  // Try parse JSON parts
  if (raw.parts) {
    return raw.parts.map(p => p.text).join("\n").trim();
  }

  return JSON.stringify(raw);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const update = req.body;
  if (!update) return res.status(400).send("No update");

  try {
    // Handle callback_query (inline buttons)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const userId = cb.from.id;

      if (cb.data === "enter_code") {
        await sendTelegram("answerCallbackQuery", {
          callback_query_id: cb.id,
          text: "Please send me your premium code now.",
          show_alert: false,
        });
        await sendTelegram("sendMessage", {
          chat_id: chatId,
          text: "💬 Please type your premium code:",
        });
        return res.status(200).send("OK");
      }
      return res.status(200).send("OK");
    }

    // Message handling
    const msg = update.message;
    if (!msg) return res.status(200).send("No message");

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = (msg.text || "").trim();

    // Admin create code command
    if (userId === OWNER_ID && text.startsWith("/createcode")) {
      const parts = text.split(" ");
      if (parts.length === 2) {
        const code = parts[1].toLowerCase();
        if (premiumCodes.has(code)) {
          await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `❌ Code *${escapeMarkdown(code)}* already exists.`,
            parse_mode: "Markdown",
          });
        } else {
          premiumCodes.set(code, false);
          await sendTelegram("sendMessage", {
            chat_id: chatId,
            text: `✅ Created premium code: *${escapeMarkdown(code)}*`,
            parse_mode: "Markdown",
          });
        }
      } else {
        await sendTelegram("sendMessage", {
          chat_id: chatId,
          text: "Usage: /createcode yourcode",
        });
      }
      return res.status(200).send("OK");
    }

    // /start command
    if (text === "/start") {
      const photoUrl = await getChannelPhoto();
      const caption = `👋 *Welcome to Gemini Bot!*\n\n` +
        `✨ To use me unlimited, please join our channel ${CHANNEL_USERNAME}.\n` +
        `Or enter a premium code for 10 seconds of access.\n\n` +
        `Choose below 👇`;

      if (photoUrl) {
        await sendTelegram("sendPhoto", {
          chat_id: chatId,
          photo: photoUrl,
          caption,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔗 Join Channel", url: `https://t.me/${CHANNEL_USERNAME.replace(/^@/, "")}` }],
              [{ text: "🔑 Enter Premium Code", callback_data: "enter_code" }],
            ],
          },
        });
      } else {
        await sendTelegram("sendMessage", {
          chat_id: chatId,
          text: caption,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔗 Join Channel", url: `https://t.me/${CHANNEL_USERNAME.replace(/^@/, "")}` }],
              [{ text: "🔑 Enter Premium Code", callback_data: "enter_code" }],
            ],
          },
        });
      }
      return res.status(200).send("OK");
    }

    // Check if user has access (joined channel or premium code)
    const now = Date.now();

    let hasAccess = false;

    const session = userSessions.get(userId);
    if (session && session > now) {
      hasAccess = true;
    } else {
      // Check channel membership
      const inChannel = await checkUserInChannel(userId);
      if (inChannel) hasAccess = true;
    }

    // User sent premium code text
    if (!hasAccess && premiumCodes.has(text.toLowerCase())) {
      if (premiumCodes.get(text.toLowerCase()) === false) {
        premiumCodes.set(text.toLowerCase(), true);
        userSessions.set(userId, now + 10 * 1000); // 10 seconds access

        await sendTelegram("sendMessage", {
          chat_id: chatId,
          text: `✅ Premium code accepted! You have 10 seconds of access.`,
        });
        return res.status(200).send("OK");
      } else {
        await sendTelegram("sendMessage", {
          chat_id: chatId,
          text: `❌ This premium code was already used.`,
        });
        return res.status(200).send("OK");
      }
    }

    if (!hasAccess) {
      await sendTelegram("sendMessage", {
        chat_id: chatId,
        text: `🚫 You must either join our channel *${CHANNEL_USERNAME}* or enter a valid premium code.\n\nChoose below:`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Join Channel", url: `https://t.me/${CHANNEL_USERNAME.replace(/^@/, "")}` }],
            [{ text: "🔑 Enter Premium Code", callback_data: "enter_code" }],
          ],
        },
      });
      return res.status(200).send("OK");
    }

    // User has access - process Gemini API
    // Show typing
    await sendTelegram("sendChatAction", { chat_id: chatId, action: "typing" });

    // Call Gemini API
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { parts: [{ text }] }
        ]
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      await sendTelegram("sendMessage", {
        chat_id: chatId,
        text: `❌ Gemini API error:\n${escapeMarkdown(errText)}`,
      });
      return res.status(200).send("OK");
    }

    const geminiData = await geminiRes.json();

    let reply = geminiData.candidates?.[0]?.content || "Sorry, no reply.";

    if (typeof reply === "object" && reply.parts) {
      reply = reply.parts.map(p => p.text).join("\n").trim();
    }

    // Format reply: if looks like HTML, send as code block
    if (looksLikeHtml(reply)) {
      await sendTelegram("sendMessage", {
        chat_id: chatId,
        text: `📝 Here is your code snippet:\n\n\`\`\`html\n${reply}\n\`\`\``,
        parse_mode: "Markdown",
      });
    } else {
      await sendTelegram("sendMessage", {
        chat_id: chatId,
        text: `🤖 *Gemini Bot Reply:*\n\n${escapeMarkdown(reply)}`,
        parse_mode: "Markdown",
      });
    }

    return res.status(200).send("OK");

  } catch (e) {
    console.error(e);
    res.status(200).send("OK");
  }
}
