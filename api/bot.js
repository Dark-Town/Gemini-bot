import express from "express";
import fetch from "node-fetch"; // or global fetch in modern node versions

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
    // Call Gemini API with user input
    const geminiResponse = await fetch(process.env.GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-1",       // Adjust to your Gemini model name
        messages: [
          { role: "user", content: userText }
        ],
      }),
    });

    if (!geminiResponse.ok) {
      console.error("Gemini API error:", await geminiResponse.text());
      await sendTelegramMessage(chat_id, "Sorry, Gemini API error.");
      return res.status(200).send("gemini error");
    }

    const geminiData = await geminiResponse.json();
    // Adjust based on Gemini response format
    const botReply = geminiData.choices?.[0]?.message?.content || "No reply from Gemini";

    // Send reply back to Telegram user
    await sendTelegramMessage(chat_id, botReply);

  } catch (err) {
    console.error("Error:", err);
    await sendTelegramMessage(chat_id, "Oops, something went wrong.");
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
