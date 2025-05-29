export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');
  
  const body = req.body;
  const message = body.message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  const name = `${message?.from?.first_name || ''} ${message?.from?.last_name || ''}`;
  const isOwner = String(userId) === process.env.OWNER_ID;

  // Check membership
  const memberRes = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember?chat_id=@${process.env.CHANNEL_USERNAME}&user_id=${userId}`);
  const memberData = await memberRes.json();
  const isMember = ['member', 'administrator', 'creator'].includes(memberData.result?.status);

  // Get stored premium codes (in-memory)
  global.codes = global.codes || {};

  // Handle /start
  if (text === '/start') {
    const photoUrl = `https://t.me/${process.env.CHANNEL_USERNAME}`;
    const welcomeText = `👋 Welcome ${name}!\n\n🚫 You must either join our channel [@${process.env.CHANNEL_USERNAME}](https://t.me/${process.env.CHANNEL_USERNAME}) or enter a valid premium code to use this bot.`;
    
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      text: welcomeText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Join Channel', url: `https://t.me/${process.env.CHANNEL_USERNAME}` }],
          [{ text: '🔐 Enter Premium Code', callback_data: 'use_code' }]
        ]
      }
    });

    return res.status(200).send('start sent');
  }

  // Admin command to create code
  if (text?.startsWith('/gen') && isOwner) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    global.codes[code] = Date.now() + 10000; // 10 seconds usage
    return await sendTelegram('sendMessage', {
      chat_id: chatId,
      text: `✅ Premium code generated:\n\n*${code}* (valid for 10 sec)`,
      parse_mode: 'Markdown'
    });
  }

  // If not member and not using valid premium code
  if (!isMember && !global.premium?.[userId]) {
    if (text?.length === 6 && global.codes[text.toUpperCase()]) {
      global.premium = global.premium || {};
      global.premium[userId] = true;

      setTimeout(() => delete global.premium[userId], 10000); // expire after 10 seconds
      return await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '✅ Premium code accepted! You can now use the bot for 10 seconds.'
      });
    }

    return await sendTelegram('sendMessage', {
      chat_id: chatId,
      text: '🚫 You must either join our channel or enter a valid premium code.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Join Channel', url: `https://t.me/${process.env.CHANNEL_USERNAME}` }],
          [{ text: '🔐 Enter Premium Code', callback_data: 'use_code' }]
        ]
      }
    });
  }

  // Show typing indicator
  await sendTelegram('sendChatAction', { chat_id: chatId, action: 'typing' });

  // Send to Gemini
  const geminiReply = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }]
    })
  });

  const geminiData = await geminiReply.json();
  const answer = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '❌ Gemini response error.';

  await sendTelegram('sendMessage', {
    chat_id: chatId,
    text: `🤖 *Gemini Bot says:*\n\n${answer}`,
    parse_mode: 'Markdown'
  });

  res.status(200).send('OK');
}

async function sendTelegram(method, data) {
  return await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}
