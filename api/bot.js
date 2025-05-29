import express from "express";

const app = express();
app.use(express.json());

app.post("/api/bot", async (req, res) => {
  const update = req.body;
  console.log("Update received:", JSON.stringify(update, null, 2));

  if (!update.message || !update.message.text) {
    return res.status(200).send("no message");
  }

  const chat_id = update.message.chat.id;
  const userText = update.message.text;

  try {
    if (userText === "/start") {
      await sendTelegramMessage(chat_id, "👋 Welcome! Send me any text, and I'll reply using Gemini API.");
      return res.status(200).send("ok");
    }

    // Call Google Gemini Generative Language API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      await sendTelegramMessage(chat_id, "Gemini API error:\n" + errorText);
      return res.status(200).send("gemini error");
    }

    const data = await response.json();

    const botReply = data.candidates?.[0]?.content || "Sorry, no reply from Gemini API.";

    await sendTelegramMessage(chat_id, botReply);

  } catch (err) {
    console.error("Error:", err);
    await sendTelegramMessage(chat_id, `Oops, something went wrong:\n${err.message || err}`);
  }

  res.status(200).send("ok");
});

async function sendTelegramMessage(chat_id, text) {
  const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(telegramUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
}

export default app;
