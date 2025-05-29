import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
  throw new Error("Please set TELEGRAM_BOT_TOKEN and GEMINI_API_KEY env vars");
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function sendMessage(chat_id, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, parse_mode: "Markdown" }),
  });
}

async function callGeminiAPI(prompt) {
  // Example Gemini API call structure (adjust according to real Gemini API)
  const response = await fetch("https://api.gemini.example.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gemini-1-chat", // example model name
      messages: [
        { role: "system", content: "You are a helpful coding assistant." },
        { role: "user", content: prompt },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const data = await response.json();
  // Assuming Gemini returns messages similarly to OpenAI chat completions
  return data.choices[0].message.content;
}

app.post("/api/bot", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.text) {
      return res.status(200).send("No message");
    }

    const chat_id = message.chat.id;
    const prompt = message.text;

    // Send "typing..." action
    await fetch(`${TELEGRAM_API}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, action: "typing" }),
    });

    // Call Gemini API to get response
    const geminiResponse = await callGeminiAPI(prompt);

    // Send the Gemini response back to user
    await sendMessage(chat_id, geminiResponse);

    res.status(200).send("ok");
  } catch (error) {
    console.error("Error in bot:", error);
    res.status(500).send("Internal Server Error");
  }
});

export default app;
