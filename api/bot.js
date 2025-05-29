import express from "express";

const app = express();
app.use(express.json());

app.get("/api/keepalive", (req, res) => {
  res.status(200).send("I am alive!");
});

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
      await sendTelegramMessage(chat_id, "Welcome! This bot replies using Gemini API.");
      return res.status(200).send("ok");
    }

    // Call Gemini API
    const geminiResponse = await fetch(process.env.GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-1", // adjust your model if needed
        messages: [
          { role: "user", content: userText }
        ],
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      await sendTelegramMessage(chat_id, "Gemini API error:\n" + errorText);
      return res.status(200).send("gemini error");
    }

    const geminiData = await geminiResponse.json();
    const botReply = geminiData.choices?.[0]?.message?.content || "No reply from Gemini";

    await sendTelegramMessage(chat_id, botReply);

  } catch (err) {
    console.error("Fetch or other error:", err);
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
