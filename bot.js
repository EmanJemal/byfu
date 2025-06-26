require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// ─── Config & Setup ─────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN;

const adminChats = [
  { id: process.env.ADMIN_1_CHAT_ID, code: '' },
  { id: process.env.ADMIN_2_CHAT_ID, code: '' },
  { id: process.env.ADMIN_3_CHAT_ID, code: '' }
];

// ─── CORS Setup ────────────────────────────────────────────────
const allowedOrigins = [
  'https://byd-kappa.vercel.app', // ✅ Add this line
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like curl or mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: false
}));


app.use(bodyParser.json());

// ─── Firebase Setup ────────────────────────────────────────────
try {
  const base64 = process.env.FIREBASE_CONFIG_BASE64;
  const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
  const serviceAccount = JSON.parse(jsonStr);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://byd-furniture-36585-default-rtdb.firebaseio.com'
  });

  console.log("✅ Firebase initialized");
} catch (err) {
  console.error("❌ Firebase config error:", err.message);
  process.exit(1);
}

const db = admin.database();

const purchaseStartTime = Date.now();

// ─── Listen for new purchases ─────────────────────────────────────────────
db.ref('purchases').on('child_added', async (snapshot) => {
  const purchase = snapshot.val();
  const key = snapshot.key;

  if (!purchase || new Date(purchase.date).getTime() < purchaseStartTime) return;

  const { customerName, date, screenshotIds = [], products = [] } = purchase;

  for (let admin of adminChats) {
    const chatId = admin.id;

    for (let p of products) {
      const productRef = db.ref(`products/${p.id}`);
      const productSnap = await productRef.once('value');
      const product = productSnap.val();
      if (!product) continue;

      // Get quantity to subtract
      const qty = parseInt(p.qty) || 0;
      const location = p.choice === 'Suq' ? 'amount_suq' : 'amount_store';
      const currentAmount = parseInt(product[location]) || 0;
      const newAmount = Math.max(0, currentAmount - qty); // prevent negative

      // Update database
      await productRef.update({ [location]: newAmount });

      // Notify admin
      let caption = `🛒 *New Sale*\n👤 *${customerName}*\n📦 *${p.name}* (${p.choice})\n🔢 Qty: *${qty}*\n💰 Price: *${p.price}* Birr`;
      if (p.qabd) caption += `\n💵 Qabd: *${p.qabd}* Birr`;
      caption += `\n📉 Remaining in ${p.choice}: *${newAmount}*`;
      caption += `\n📅 ${new Date(date).toLocaleString()}`;

      const photo = (product.image?.startsWith('AgA') ? product.image : null);
      if (photo) {
        await bot.sendPhoto(chatId, photo, {
          caption,
          parse_mode: "Markdown"
        });
      } else {
        await bot.sendMessage(chatId, caption, {
          parse_mode: "Markdown"
        });
      }
    }

    // Send screenshots
    for (let ssId of screenshotIds) {
      const ssSnap = await db.ref(`Screenshot_id/${ssId}`).once('value');
      const ssData = ssSnap.val();
      if (ssData?.image?.startsWith("AgA")) {
        await bot.sendPhoto(chatId, ssData.image, {
          caption: `🧾 Payment Screenshot (ID: ${ssId})\n👤 *${customerName}*\n📅 ${ssData.date || "Unknown"}`,
          parse_mode: "Markdown"
        });
      }
    }
  }

  console.log(`✅ Notified admins about new purchase: ${key}`);
});






// ─── Telegram Bot Setup ────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });

// ─── Send Code Endpoint ────────────────────────────────────────
app.post('/send-code', async (req, res) => {
  const { botCode } = req.body;
  console.log("📩 Received /send-code request for botCode:", botCode);

  if (!botCode) {
    return res.status(400).json({ success: false, error: 'Bot code missing.' });
  }

  try {
    for (let admin of adminChats) {
      admin.code = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`📨 Sending code ${admin.code} to admin ${admin.id}`);
      await bot.sendMessage(admin.id, `🔐 Login Attempt\nBot Code: ${botCode}\nYour Verification Code: ${admin.code}`);
    }

    await db.ref(`verification_codes/${botCode}`).set({
      codes: adminChats.map(a => a.code),
      sentAt: Date.now()
    });

    console.log("✅ Codes stored in DB and sent to admins.");
    res.json({ success: true });

  } catch (err) {
    console.error("❌ Error in /send-code:", err);
    res.status(500).json({ success: false, error: 'Failed to send messages.' });
  }
});

// ─── Verify Code Endpoint ──────────────────────────────────────
app.post('/verify-code', async (req, res) => {
  const { botCode, verificationCode } = req.body;
  console.log("🔍 Verifying code for botCode:", botCode);

  if (!botCode || !verificationCode) {
    return res.status(400).json({ success: false, message: 'Missing botCode or verificationCode.' });
  }

  try {
    const snapshot = await db.ref(`verification_codes/${botCode}`).once('value');
    const data = snapshot.val();

    if (!data || !data.codes) {
      return res.json({ success: false, message: 'No codes found for this bot code' });
    }

    const isValid = data.codes.includes(verificationCode);
    console.log(`🔐 Code verification result: ${isValid}`);
    res.json({ success: isValid });

  } catch (err) {
    console.error('❌ Error in /verify-code:', err);
    res.status(500).json({ success: false });
  }
});

// ─── Telegram Image Proxy Endpoint ─────────────────────────────
app.get('/telegram-image/:fileId', async (req, res) => {
  const fileId = req.params.fileId;

  try {
    const file = await bot.getFile(fileId);
    if (!file || !file.file_path) {
      console.error("⚠️ No file path received from Telegram");
      return res.status(404).send('Image not found (no file_path)');
    }

    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
    return res.redirect(fileUrl);

  } catch (err) {
    console.error("❌ Failed to get Telegram file:", err);
    return res.status(404).send('Image not found');
  }
});


// ─── Start Server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});



console.log('✅ Bot is up and running...');

  // ✅ Convert string IDs from .env to numbers
  const allowedUsers = [
    parseInt(process.env.ADMIN_CHAT_ID),
    parseInt(process.env.ADMIN_1_CHAT_ID),
    parseInt(process.env.ADMIN_2_CHAT_ID),
    parseInt(process.env.ADMIN_3_CHAT_ID),
    parseInt(process.env.Abdela)
  ];

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'there';


  // ✅ Check if user is allowed
  if (!allowedUsers.includes(chatId)) {
    console.log(`❌ Unauthorized user attempted to /start: ${chatId}`);
    return; // Stop here — do not respond
  }

  // ✅ Save to Realtime Database
  await db.ref('users/' + chatId).set({
    firstName: firstName,
    chatId: chatId,
    joinedAt: Date.now()
  });

  // ✅ Send welcome message
  bot.sendMessage(chatId, `👋 Hello ${firstName}!\nYou're now connected to the bot.`);
});

const userStates = {};

bot.onText(/\/store/, (msg) => {
  const chatId = msg.chat.id;

  // ✅ Check if user is allowed
  if (!allowedUsers.includes(chatId)) {
    console.log(`❌ Unauthorized user attempted to /start: ${chatId}`);
    return; // Stop here — do not respond
  }

  userStates[chatId] = { step: 'awaiting_image', data: {} };
  bot.sendMessage(chatId, '📸 Photo ላክ');
});


const screenshotSessions = {};

// Handle /screenshot command
bot.onText(/\/screenshot/, async (msg) => {
  const chatId = msg.chat.id;

    // ✅ Check if user is allowed
    if (!allowedUsers.includes(chatId)) {
      console.log(`❌ Unauthorized user attempted to /start: ${chatId}`);
      return; // Stop here — do not respond
    }

  bot.sendMessage(chatId, `📷 Please send the 4-digit Screenshot ID:`);

  screenshotSessions[chatId] = { step: 'awaiting_id' };
});

// Handle responses
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const session = screenshotSessions[chatId];

  if (!session) return;

  // Step 1: Receive Screenshot ID
  if (session.step === 'awaiting_id' && msg.text) {
    const id = msg.text.trim();

    // Validate format
    if (!/^\d{4}$/.test(id)) {
      return bot.sendMessage(chatId, `❌ Screenshot ID must be exactly 4 digits. Try again.`);
    }

    // Check if ID already exists in Firebase
    const screenshotRef = db.ref(`Screenshot_id/${id}`);
    const snapshot = await screenshotRef.once('value');

    if (snapshot.exists()) {
      // ID taken, ask for another
      return bot.sendMessage(chatId, `❌ Screenshot ID *${id}* is already taken. Please send a different 4-digit ID:`, {
        parse_mode: 'Markdown'
      });
    }

    // ID free, save it in session and ask for photo
    session.screenshotId = id;
    session.step = 'awaiting_photo';

    return bot.sendMessage(chatId, `✅ Screenshot ID set to *${id}*\n📤 Now send the screenshot photo:`, {
      parse_mode: 'Markdown'
    });
  }

  // Step 2: Receive Photo
  if (session.step === 'awaiting_photo' && msg.photo) {
    const file = msg.photo[msg.photo.length - 1]; // highest resolution
    const fileId = file.file_id;

    const screenshotRef = db.ref(`Screenshot_id/${session.screenshotId}`);
    await screenshotRef.set({
      date: new Date().toISOString(),
      image: fileId
    });

    delete screenshotSessions[chatId]; // clear session

    return bot.sendMessage(chatId, `✅ Screenshot saved successfully under ID *${session.screenshotId}*`, {
      parse_mode: 'Markdown'
    });
  }

  // Catch invalid responses
  if (session.step === 'awaiting_id' && msg.text && !/^\d{4}$/.test(msg.text)) {
    return bot.sendMessage(chatId, `❌ Screenshot ID must be exactly 4 digits. Try again.`);
  }

  if (session.step === 'awaiting_photo' && !msg.photo) {
    if (msg.text && msg.text.startsWith('/')) return; // user is running another command

    return bot.sendMessage(chatId, `❌ Please send a valid photo.`);
  }
});




// Message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const state = userStates[chatId];

  // ✅ Check if user is allowed
  if (!allowedUsers.includes(chatId)) {
    console.log(`❌ Unauthorized user attempted to /start: ${chatId}`);
    return; // Stop here — do not respond
  }


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
      caption: adminMessage,
      reply_markup: {
          inline_keyboard: [[
            {
              text: '✏️ Edit Product',
              callback_data: `admin_edit_${state.data.code}`
            },
            {
              text: '🗑️ Add Product',
              callback_data: `admin_add_product_${state.data.code}`
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
    // Check if user is admin, otherwise ignore
  if (!allowedUsers.includes(chatId)) {
    console.log(`❌ Unauthorized user attempted to /start: ${chatId}`);
    return; // Stop here — do not respond
  }
 
  editSessions[chatId] = { step: 'awaiting_code', data: {}, key: null };
  bot.sendMessage(chatId, '🔎 product code አስገቡ.');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
    // Check if user is admin, otherwise ignore
    if (!allowedUsers.includes(chatId)) {
      console.log(`❌ Unauthorized user attempted to /start: ${chatId}`);
      return; // Stop here — do not respond
    }
 
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
            },
            {
              text: '🗑️ Add Product',
              callback_data: `admin_add_product_${session.data.code}`
            }
          ]]
        }
      });
    
      // ✅ Notify editor
      bot.sendMessage(chatId, '✅ You have successfully finished editing this product.');
      delete editSessions[chatId];
      return;
    }
     else {
      if (msg.text && msg.text.startsWith('/')) return; // user is running another command
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

  
  const addProductSessions = {}; // ✅ Declare once globally at the top of your file

  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
  
    // ✅ Admin Edit Product Button
    if (data.startsWith('admin_edit_')) {
      if (!allowedUsers.includes(chatId)) return;
  
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
  
      editSessions[chatId] = {
        key: foundKey,
        original: foundProduct,
        data: { ...foundProduct },
        step: 'menu'
      };
  
      bot.answerCallbackQuery(callbackQuery.id);
      sendEditMenu(chatId, foundProduct);
      return bot.sendPhoto(chatId, foundProduct.image, { caption: `7) 🖼️ Current Image` });
    }
  
    // ✅ Admin Add Product Button
    if (data.startsWith('admin_add_product_')) {
      if (!allowedUsers.includes(chatId)) return;
  
      const productCode = data.replace('admin_add_product_', '');
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
  
      addProductSessions[chatId] = {
        key: foundKey,
        data: foundProduct,
        step: 'choose_location'
      };
  
      bot.answerCallbackQuery(callbackQuery.id);
      return bot.sendMessage(chatId, `📍 Where did the new items go?`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🏪 Suq', callback_data: 'add_to_suq' },
              { text: '📦 Store', callback_data: 'add_to_store' }
            ]
          ]
        }
      });
    }
  
    // ✅ Handle Suq or Store choice
    if (data === 'add_to_suq' || data === 'add_to_store') {
      const session = addProductSessions[chatId];
      if (!session) return;
  
      session.location = data === 'add_to_suq' ? 'suq' : 'store';
      session.step = 'awaiting_amount';
  
      bot.answerCallbackQuery(callbackQuery.id);
      return bot.sendMessage(chatId, `✍️ How many items were added to ${session.location === 'suq' ? '🏪 Suq' : '📦 Store'}?`);
    }
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
  
    // ✅ Handle Add Product amount entry
    if (addProductSessions[chatId] && msg.text && !isNaN(msg.text)) {
      const session = addProductSessions[chatId];
      const amountToAdd = parseInt(msg.text);
      const locationField = session.location === 'suq' ? 'amount_suq' : 'amount_store';
      const current = parseInt(session.data[locationField] || '0');
      const newAmount = current + amountToAdd;
  
      // ✅ Update products
      await db.ref(`products/${session.key}`).update({
        [locationField]: newAmount.toString()
      });
  
      // ✅ Log to /added_product
      await db.ref('added_product').push({
        name: session.data.name,
        code: session.data.code,
        amount_added: amountToAdd,
        date_added: Date.now(),
        new_amount: newAmount,
        location: session.location
      });
  
      await bot.sendMessage(chatId, `✅ Updated ${session.location.toUpperCase()} quantity.\nNew total: ${newAmount}`);
      delete addProductSessions[chatId];
      return;
    }
  
  });
  
  
  

  bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
  
      // ✅ Check if user is allowed
      if (!allowedUsers.includes(chatId)) {
        console.log(`❌ Unauthorized user attempted to /start: ${chatId}`);
        return; // Stop here — do not respond
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
              },
              {
                text: '🗑️ Add Product',
                callback_data: `admin_add_product_${p.code}` // ✅ FIXED
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
  

  bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
  
    let cancelled = false;
  
    if (userStates[chatId]) {
      delete userStates[chatId];
      cancelled = true;
    }
  
    if (editSessions[chatId]) {
      delete editSessions[chatId];
      cancelled = true;
    }
  
    if (addProductSessions[chatId]) {
      delete addProductSessions[chatId];
      cancelled = true;
    }
  
    if (cancelled) {
      bot.sendMessage(chatId, '❌ Operation cancelled.');
    } else {
      bot.sendMessage(chatId, 'ℹ️ No active operation to cancel.');
    }
  });
  