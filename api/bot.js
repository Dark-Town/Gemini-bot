import express from "express";

const app = express();
app.use(express.json());

// Keep-alive endpoint to reduce cold starts
app.get("/api/keepalive", (req, res) => {
  res.status(200).send("I am alive!");
});

app.post("/api/bot", async (req, res) => {
  const update = req.body;
  console.log("Update received:", JSON.stringify(update, null, 2));

  if (!update.message) {
    return res.status(200).send("no message");
  }

  const chat_id = update.message.chat.id;
  const text = update.message.text || "";

  try {
    if (text === "/start") {
      // Send welcome message on /start command
      await sendTelegramMessage(chat_id, "Welcome! This bot echoes back your messages.");
    } else {
      // Echo back any message sent by user
      await sendTelegramMessage(chat_id, `You said: ${text}`);
    }
  } catch (err) {
    console.error("Failed to send message:", err);
  }

  // Reply 200 OK to Telegram immediately
  res.status(200).send("ok");
});

// Helper function to send messages via Telegram API
async function sendTelegramMessage(chat_id, text) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
}

export default app;
