require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN;

const bot = new TelegramBot(TOKEN);

app.get('/telegram-image/:fileId', async (req, res) => {
  const fileId = req.params.fileId;

  try {
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
    return res.redirect(fileUrl);
  } catch (err) {
    console.error("Failed to get Telegram file:", err);
    return res.status(404).send('Image not found');
  }
});

app.listen(PORT, () => {
  console.log(`Telegram image server listening on http://localhost:${PORT}`);
});
