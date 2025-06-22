require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const serviceAccount = require(process.env.FIREBASE_KEY_PATH);

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // allow web page to connect
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Get admin IDs from .env
const adminChats = [
  { id: process.env.ADMIN_1_CHAT_ID, code: '' },
  { id: process.env.ADMIN_2_CHAT_ID, code: '' },
  { id: process.env.ADMIN_3_CHAT_ID, code: '' }
];

// Endpoint to receive botCode from frontend and send unique codes to admins
app.post('/verify-code', async (req, res) => {
  const { botCode, verificationCode } = req.body;

  try {
    const snapshot = await db.ref('verification_codes/' + botCode).once('value');
    const data = snapshot.val();

    if (!data || !data.codes) {
      return res.json({ success: false, message: 'No codes found for this bot code' });
    }

    if (data.codes.includes(verificationCode)) {
      return res.json({ success: true });
    }

    res.json({ success: false, message: 'Invalid verification code' });

  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ success: false });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Express server running on http://localhost:${PORT}`);
});

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });



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


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://byd-furniture-36585-default-rtdb.firebaseio.com'
});

const db = admin.database();

// Add this route to handle sending the codes
app.post('/send-code', async (req, res) => {
  const { botCode } = req.body;
  console.log("📩 Received send-code request:", botCode);

  if (!botCode) {
    console.log("❌ Bot code missing");
    return res.status(400).json({ success: false, error: 'Bot code missing.' });
  }

  try {
    for (let admin of adminChats) {
      admin.code = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`📨 Sending to admin ${admin.id}: ${admin.code}`);

      await bot.sendMessage(admin.id, `🔐 Login Attempt\nBot Code: ${botCode}\nYour Verification Code: ${admin.code}`);
    }

    await db.ref('verification_codes/' + botCode).set({
      codes: adminChats.map(a => a.code),
      sentAt: Date.now()
    });

    console.log("✅ Codes saved and sent.");
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error sending codes:', err);
    res.status(500).json({ success: false, error: 'Failed to send messages.' });
  }
});




console.log('✅ Bot is up and running...');

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'there';

  // ✅ Save to Realtime Database
  await db.ref('users/' + chatId).set({
    firstName: firstName,
    chatId: chatId,
    joinedAt: Date.now()
  });

  bot.sendMessage(chatId, `👋 Hello ${firstName}!\nYou're now connected to the bot.`);
});




const userStates = {};

bot.onText(/\/store/, (msg) => {
  const chatId = msg.chat.id;
  userStates[chatId] = { step: 'awaiting_image', data: {} };
  bot.sendMessage(chatId, '📸 Photo ላክ');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const state = userStates[chatId];

  if (!state) return; // User not in /store flow

  // 1. Receive image
  if (state.step === 'awaiting_image' && msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    state.data.image = fileId;
    state.step = 'awaiting_name';
    return bot.sendMessage(chatId, '📝 አሁን የእቃውን ስም.');
  }

  // 2. Receive name
  if (state.step === 'awaiting_name' && msg.text) {
    state.data.name = msg.text;
    state.step = 'awaiting_code';
    return bot.sendMessage(chatId, '🔢 አሁን የእቃውን code.');
  }

  // 3. Product code
  if (state.step === 'awaiting_code' && msg.text) {
    state.data.code = msg.text;
    state.step = 'awaiting_cost';
    return bot.sendMessage(chatId, '💰 አሁን የተገዛበት ዋጋ ወይም Skip ብሎ ይፃፉ');
  }

  // 4. Cost Price
  if (state.step === 'awaiting_cost' && msg.text) {
    state.data.cost = msg.text.toLowerCase() === 'skip' ? null : msg.text;
    state.step = 'awaiting_selling';
    return bot.sendMessage(chatId, '💵 አሁን የሚሸጥበት ዋጋ ወይም Skip ብሎ ይፃፉ');
  }

  // 5. Selling Price
  if (state.step === 'awaiting_selling' && msg.text) {
    state.data.selling = msg.text.toLowerCase() === 'skip' ? null : msg.text;
    state.step = 'awaiting_store';
    return bot.sendMessage(chatId, '📦 Store ያለ ፈሬ ወይም Skip ብሎ ይፃፉ.');
  }

  // 6. Amount in store
  if (state.step === 'awaiting_store' && msg.text) {
    state.data.amount_store = msg.text.toLowerCase() === 'skip' ? null : msg.text;
    state.step = 'awaiting_suq';
    return bot.sendMessage(chatId, '🏪 Suq ያለ ፈሬ ወይም Skip ብሎ ይፃፉ.');
  }

  // 7. Amount in suq
  if (state.step === 'awaiting_suq' && msg.text) {
    state.data.amount_suq = msg.text.toLowerCase() === 'skip' ? null : msg.text;

    // ✅ Save to Firebase
    const newRef = db.ref('products').push();
    await newRef.set({
      ...state.data,
      createdBy: chatId,
      createdAt: Date.now()
    });

    // ✅ Notify Admin
    const adminMessage = `
🆕 አዲስ እቃ ተመዝግቦዋል:

📝 ስም: ${state.data.name}
🔢 Code: ${state.data.code}
💰 የተገዛበት እቃ: ${state.data.cost || 'N/A'}
💵 የሚሸጥበት እቃ: ${state.data.selling || 'N/A'}
📦 Store ያለ ፍሬ: ${state.data.amount_store || 'N/A'}
🏪 Suq ያለ ፍሬ: ${state.data.amount_suq || 'N/A'}
👤 From: @${msg.from.username || msg.from.first_name}
    `.trim();

    // Send photo + caption
    bot.sendPhoto(process.env.ADMIN_CHAT_ID, state.data.image, {
      caption: adminText,
      reply_markup: {
          inline_keyboard: [[
            {
              text: '✏️ Edit Product',
              callback_data: `admin_edit_${state.data.code}`
            }
          ]]
        }
      });
      
    // ✅ Confirm to user
    bot.sendMessage(chatId, '✅ Item registered and sent to admin.');

    // Clear user state
    delete userStates[chatId];
  }
});

const editSessions = {};

bot.onText(/\/edit/, (msg) => {
  const chatId = msg.chat.id;
  editSessions[chatId] = { step: 'awaiting_code', data: {}, key: null };
  bot.sendMessage(chatId, '🔎 product code አስገቡ.');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const session = editSessions[chatId];
  if (!session) return;

  // Step 1: Get code
  if (session.step === 'awaiting_code' && msg.text) {
    const code = msg.text.trim();
    const snapshot = await db.ref('products').once('value');
    const products = snapshot.val();
    let foundKey = null;

    for (let key in products) {
      if (products[key].code === code) {
        foundKey = key;
        break;
      }
    }

    if (!foundKey) {
      delete editSessions[chatId];
      return bot.sendMessage(chatId, '❌ Product code check አርጉ.');
    }

    session.key = foundKey;
    session.original = products[foundKey];
    session.data = { ...products[foundKey] };
    session.step = 'menu';

    sendEditMenu(chatId, session.data);
    return bot.sendPhoto(chatId, session.data.image, { caption: `7) 🖼️ Current Image` });
  }

  // Step 2: Handle menu choice
  if (session.step === 'menu' && msg.text) {
    const choice = msg.text.trim();

    if (choice === '1') {
      session.step = 'edit_name';
      return bot.sendMessage(chatId, `✏️ ስም: ${session.data.name}\nEnter new name:`);
    } else if (choice === '2') {
      session.step = 'edit_code';
      return bot.sendMessage(chatId, `✏️ Code: ${session.data.cost || 'N/A'}\nEnter new code:`);
    } else if (choice === '3') {
      session.step = 'edit_cost';
      return bot.sendMessage(chatId, `✏️ የተገዛበት ዋጋ: ${session.data.cost || 'N/A'}\nEnter new cost price:`);
    } else if (choice === '4') {
      session.step = 'edit_selling';
      return bot.sendMessage(chatId, `✏️ የሚሸጥበት ዋጋ: ${session.data.selling || 'N/A'}\nEnter new selling price:`);
    } else if (choice === '5') {
      session.step = 'edit_store';
      return bot.sendMessage(chatId, `✏️ Store ያለ ፈሬ: ${session.data.amount_store || 'N/A'}\nEnter new amount:`);
    } else if (choice === '6') {
      session.step = 'edit_suq';
      return bot.sendMessage(chatId, `✏️ Suq ያለ ፈሬ: ${session.data.amount_suq || 'N/A'}\nEnter new amount:`);
    } else if (choice === '7') {
      session.step = 'edit_image';
      return bot.sendMessage(chatId, `📸 አዲስ Photo ይላኩ:`);
    } else if (choice === '8') {
      // ✅ Finish Editing
      await db.ref('products/' + session.key).update({
        ...session.data,
        updatedAt: Date.now()
      });

      // Notify Admin
      const adminText = `
✏️ Product Updated:

1) ስም: ${session.data.name}
2) የተገዛበት ዋጋ: ${session.data.cost || 'N/A'}
3) የሚሸጥበት ዋጋ: ${session.data.selling || 'N/A'}
4) Store ያለ ፈሬ: ${session.data.amount_store || 'N/A'}
5) Suq ያለ ፈሬ: ${session.data.amount_suq || 'N/A'}
👤 Edited by: @${msg.from.username || msg.from.first_name}
      `.trim();

      bot.sendPhoto(process.env.ADMIN_CHAT_ID, session.data.image, {
        caption: adminText,
        reply_markup: {
          inline_keyboard: [[
            {
              text: '✏️ Edit Product',
              callback_data: `admin_edit_${session.data.code}`
            }
          ]]
        }
      });
            bot.sendMessage(chatId, '✅ Product updated and sent to admin.');
      delete editSessions[chatId];
      return;
    } else {
      return bot.sendMessage(chatId, '❌ Invalid choice. Type a number from 1 to 7.');
    }
  }

  // Step 3: Receive new values
  const updateAndReturn = (field, value) => {
    session.data[field] = value;
    session.step = 'menu';
    sendEditMenu(chatId, session.data);
    bot.sendPhoto(chatId, session.data.image, { caption: `7) 🖼️ Current Image` });
  };

  if (session.step === 'edit_name' && msg.text) return updateAndReturn('name', msg.text);
  if (session.step === 'edit_code' && msg.text) return updateAndReturn('code', msg.text);
  if (session.step === 'edit_cost' && msg.text) return updateAndReturn('cost', msg.text);
  if (session.step === 'edit_selling' && msg.text) return updateAndReturn('selling', msg.text);
  if (session.step === 'edit_store' && msg.text) return updateAndReturn('amount_store', msg.text);
  if (session.step === 'edit_suq' && msg.text) return updateAndReturn('amount_suq', msg.text);
  if (session.step === 'edit_image' && msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    return updateAndReturn('image', fileId);
  }
});


function sendEditMenu(chatId, product) {
    const menu = `
  ✏️ መቀየር የምትፈልጉትን ቁጥር ምርጥ:
  
  1) ስም: ${product.name}
  2) Code: ${product.code}
  3) የተገዛበት ዋጋ: ${product.cost || 'N/A'}
  4) የሚሸጥበት ዋጋ: ${product.selling || 'N/A'}
  5) Store ያለ ፈሬ: ${product.amount_store || 'N/A'}
  6) Suq ያለ ፈሬ: ${product.amount_suq || 'N/A'}
  7) 🖼️ Image
  8) ✅ Finish Editing
    `.trim();
  
    bot.sendMessage(chatId, menu);
  }

  
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
  
    // Allow only admin to edit from button
    if (data.startsWith('admin_edit_')) {
      if (chatId.toString() !== process.env.ADMIN_CHAT_ID) {
        return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Only admin can use this.', show_alert: true });
      }
  
      const productCode = data.replace('admin_edit_', '');
      const snapshot = await db.ref('products').once('value');
      const products = snapshot.val();
      let foundKey = null;
      let foundProduct = null;
  
      for (let key in products) {
        if (products[key].code === productCode) {
          foundKey = key;
          foundProduct = products[key];
          break;
        }
      }
  
      if (!foundKey) {
        return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product not found.', show_alert: true });
      }
  
      // Start edit session for admin
      editSessions[chatId] = {
        key: foundKey,
        original: foundProduct,
        data: { ...foundProduct },
        step: 'menu'
      };
  
      bot.answerCallbackQuery(callbackQuery.id);
      sendEditMenu(chatId, foundProduct);
      return bot.sendPhoto(chatId, foundProduct.nodimage, { caption: `7) 🖼️ Current Image` });
    }
  });
  

  bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
  
    // Only allow admin
    if (chatId.toString() !== process.env.ADMIN_CHAT_ID) {
      return bot.sendMessage(chatId, '❌ Only the admin can use this command.');
    }
  
    try {
      const snapshot = await db.ref('products').once('value');
      const products = snapshot.val();
  
      if (!products) {
        return bot.sendMessage(chatId, '📦 No products found.');
      }
  
      for (let key in products) {
        const p = products[key];
  
        const text = `
  🛋️ <b>${p.name || 'Unnamed Product'}</b>
  📦 Code: <code>${p.code}</code>
  💰 የተገዛበት ዋጋ: ${p.cost || 'N/A'}
  💵 የሚሸጥበት ዋጋ: ${p.selling || 'N/A'}
  🏢 Store ያለ ፈሬ: ${p.amount_store || 0}
  🛍️ Suq ያለ ፈሬ: ${p.amount_suq || 0}
        `.trim();
  
        const opts = {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              {
                text: '✏️ Edit Product',
                callback_data: `admin_edit_${p.code}`
              }
            ]]
          }
        };
  
        if (p.image) {
          await bot.sendPhoto(chatId, p.image, {
            caption: text,
            ...opts
          });
        } else {
          await bot.sendMessage(chatId, text, opts);
        }
      }
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, '❌ Failed to load product list.');
    }
  });
  