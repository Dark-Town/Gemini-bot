import express from "express";

const app = express();
app.use(express.json());

// === CONFIG ===
const CHANNEL_USERNAME = "@paidtechzone"; // Your channel username here
const OWNER_ID = 7080079152; // Your Telegram user id (owner/admin)
const GEMINI_API_KEY = "AIzaSyA6pjtVRAfhxNqRpEA7Tvp6VdePc4oVT6k";

// In-memory storage for premium codes and user sessions (replace with DB in prod)
const premiumCodes = new Map(); // code -> used: boolean
const userSessions = new Map(); // userId -> { expiresAt: timestamp }

app.post("/api/bot", async (req, res) => {
  const update = req.body;
  console.log("Update:", JSON.stringify(update, null, 2));

  if (!update.message) return res.status(200).send("no message");

  const msg = update.message;
  const chat_id = msg.chat.id;
  const user_id = msg.from.id;
  const userText = msg.text?.trim() || "";

  try {
    // Admin command: /createcode <code>
    if (user_id === OWNER_ID && userText.startsWith("/createcode")) {
      const parts = userText.split(" ");
      if (parts.length === 2) {
        const newCode = parts[1];
        if (premiumCodes.has(newCode)) {
          await sendTelegramMessage(chat_id, `❌ Code *${newCode}* already exists.`, { parse_mode: "Markdown" });
        } else {
          premiumCodes.set(newCode, false);
          await sendTelegramMessage(chat_id, `✅ Created premium code: *${newCode}*`, { parse_mode: "Markdown" });
        }
      } else {
        await sendTelegramMessage(chat_id, `Usage: /createcode yourcode`, { parse_mode: "Markdown" });
      }
      return res.status(200).send("admin code created");
    }

    // User /start
    if (userText === "/start") {
      // Fetch channel photo
      const photoUrl = await getChannelPhoto(CHANNEL_USERNAME);

      // Send welcome with inline keyboard
      const welcomeText = 
        `👋 𝒲𝑒𝓁𝒸𝑜𝓂𝑒 𝓉𝑜 *Gemini Bot*!\n\n` +
        `✨ To use me unlimited, please join our channel ${CHANNEL_USERNAME}.\n` +
        `Or enter a premium code for 10 seconds of access.\n\n` +
        `Choose below 👇`;

      await sendTelegramPhoto(chat_id, photoUrl, {
        caption: welcomeText,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Join Channel", url: `https://t.me/${CHANNEL_USERNAME.replace(/^@/, "")}` }],
            [{ text: "🔑 Enter Premium Code", callback_data: "enter_code" }],
          ],
        },
      });
      return res.status(200).send("start sent");
    }

    // Handle callback query for inline buttons
    if (update.callback_query) {
      const data = update.callback_query.data;
      const callback_id = update.callback_query.id;
      const userId = update.callback_query.from.id;
      const chatId = update.callback_query.message.chat.id;

      if (data === "enter_code") {
        // Ask user to send code text
        await answerCallbackQuery(callback_id, "Please send me your premium code as a message.");
        await sendTelegramMessage(chatId, "💬 Please type your premium code now:");
        return res.status(200).send("asked code");
      }

      return res.status(200).send("callback handled");
    }

    // Check if user has 10s premium access or is channel member
    const now = Date.now();

    let hasAccess = false;
    const session = userSessions.get(user_id);
    if (session && session.expiresAt > now) {
      hasAccess = true; // premium code access active
    } else {
      // Check if member in channel
      if (await checkUserInChannel(user_id)) {
        hasAccess = true;
      } else {
        hasAccess = false;
      }
    }

    if (!hasAccess) {
      // If user sent a message after asking for premium code (likely)
      if (premiumCodes.has(userText) && premiumCodes.get(userText) === false) {
        // Mark code as used
        premiumCodes.set(userText, true);
        // Give 10 sec access
        userSessions.set(user_id, { expiresAt: now + 10 * 1000 });

        await sendTelegramMessage(chat_id, `✅ Premium code accepted! You have 10 seconds of access.`);
        return res.status(200).send("premium access granted");
      }

      // Otherwise reject
      const mustJoinText = 
        `🚫 You must either join our channel *${CHANNEL_USERNAME}* or enter a valid premium code.\n\n` +
        `Click below to join or enter code:`;

      await sendTelegramMessage(chat_id, mustJoinText, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Join Channel", url: `https://t.me/${CHANNEL_USERNAME.replace(/^@/, "")}` }],
            [{ text: "🔑 Enter Premium Code", callback_data: "enter_code" }],
          ],
        },
      });
      return res.status(200).send("access denied");
    }

    // If has access, and text is not /start or admin command, proceed with Gemini API

    // Show typing
    await sendTelegramAction(chat_id, "typing");

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const apiResp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: userText }
            ]
          }
        ]
      }),
    });

    if (!apiResp.ok) {
      const errorText = await apiResp.text();
      console.error("Gemini API error:", errorText);
      await sendTelegramMessage(chat_id, "❌ Gemini API error:\n" + errorText);
      return res.status(200).send("gemini error");
    }

    const data = await apiResp.json();
    let rawReply = data.candidates?.[0]?.content || "Sorry, no reply from Gemini.";

    // Format reply: clean JSON wrapper & detect HTML
    const formattedReply = formatGeminiReply(rawReply);

    if (looksLikeHtml(formattedReply)) {
      await sendTelegramMessage(chat_id, `📝 Here's your code snippet:\n\n\`\`\`html\n${escapeMarkdown(formattedReply)}\n\`\`\``, { parse_mode: "Markdown" });
    } else {
      await sendTelegramMessage(chat_id, `🤖 *Gemini Bot Reply:*\n\n${escapeMarkdown(formattedReply)}`, { parse_mode: "Markdown" });
    }

  } catch (err) {
    console.error("Error:", err);
    await sendTelegramMessage(chat_id, `⚠️ Oops, something went wrong:\n${escapeMarkdown(err.message || err.toString())}`);
  }

  res.status(200).send("ok");
});

// === Helpers ===

async function getChannelPhoto(channelUsername) {
  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChat`;
    const res = await fetch(`${url}?chat_id=${channelUsername}`);
    const json = await res.json();
    if (json.ok && json.result.photo) {
      // Get biggest size photo file_id
      const photoSizes = json.result.photo; // array of sizes
      const biggest = photoSizes[photoSizes.length - 1];
      // getFile to get link
      const fileResp = await fetch(`${url.replace('/getChat', '/getFile')}?file_id=${biggest.file_id}`);
      const fileJson = await fileResp.json();
      if (fileJson.ok) {
        return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileJson.result.file_path}`;
      }
    }
  } catch (e) {
    console.warn("Failed to get channel photo:", e);
  }
  // fallback image url or empty
  return "";
}

async function checkUserInChannel(userId) {
  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember`;
    const res = await fetch(`${url}?chat_id=${CHANNEL_USERNAME}&user_id=${userId}`);
    const json = await res.json();
    if (!json.ok) return false;
    const status = json.result.status;
    return ["member", "creator", "administrator"].includes(status);
  } catch {
    return false;
  }
}

async function sendTelegramMessage(chat_id, text, options = {}) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, ...options }),
  });
}

async function sendTelegramPhoto(chat_id, photoUrl, options = {}) {
  if (!photoUrl) {
    // Send simple message if no photo URL
