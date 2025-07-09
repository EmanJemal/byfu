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
  { id: process.env.ADMIN_2_CHAT_ID, code: '' }
  //{ id: process.env.ADMIN_3_CHAT_ID, code: '' }
];
//const sifan = [
//  { id: process.env.ADMIN_3_CHAT_ID, code: '' }//1133990573
//];
const amana = [
  { id: process.env.ADMIN_2_CHAT_ID, code: '' }//582144194
];
const arafat = [
  { id: process.env.ADMIN_1_CHAT_ID, code: '' }//5169578668
];

// ─── CORS Setup ────────────────────────────────────────────────
const allowedOrigins = [
  'https://byd-kappa.vercel.app', 
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

  const { customerName, date, screenshotIds = [], products = [], dube, nameofseller, mobilebankamt, overallQabd  } = purchase;

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
      const newAmount = parseInt(product[location]) || 0; // already updated from frontend


      // Notify admin
      let caption = `🛒 *✅✅✅✅✅ አዲስ ሽያጭ*\n ስም: *${customerName}*\n የእቃ ስም: *${p.name}* (${p.choice})\n ብዛት: *${qty}*\n አጠቃላይ ዱቤ: *${dube || 0} Birr*\n አጠቃላይ ዋጋ: *${p.price}* Birr \n የሻጭ ስም: ${nameofseller} \n በ Mobile Bank የገባ: ${mobilebankamt} ብር`;
      if (overallQabd) caption += `\n💵 Qabd: *${overallQabd}* Birr`;
      caption += `\n ${p.choice} የቀር : *${newAmount}*`;
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
  const { botCode, adminName } = req.body;
  console.log("📩 Received /send-code request for botCode:", botCode);

  if (!botCode || !adminName) {
    return res.status(400).json({ success: false, error: 'Missing botCode or adminName.' });
  }

  try {
    let targetList;
    if (adminName === "Sifan") targetList = sifan;
    else if (adminName === "Amana") targetList = amana;
    else if (adminName === "Arafat") targetList = arafat;
    else return res.status(400).json({ success: false, error: 'Invalid admin selected.' });

    // 🧹 Clear old codes for this botCode
    await db.ref(`verification_codes/${botCode}`).remove();

    // ✅ Generate and send new codes
    for (let admin of targetList) {
      admin.code = Math.floor(100000 + Math.random() * 900000).toString();
      await bot.sendMessage(admin.id, `🔐 Login Attempt\nBot Code: ${botCode}\nYour Verification Code: ${admin.code}`);
    }

    // ✅ Store only new code
    await db.ref(`verification_codes/${botCode}`).set({
      codes: targetList.map(a => a.code),
      sentAt: Date.now()
    });

    console.log("✅ Sent & stored new code for", botCode);
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
  console.log("🔢 Code entered by user:", verificationCode);

  if (!botCode || !verificationCode) {
    return res.status(400).json({ success: false, message: 'Missing botCode or verificationCode.' });
  }

  try {
    const snapshot = await db.ref(`verification_codes/${botCode}`).once('value');
    const data = snapshot.val();

    if (!data || !data.codes) {
      console.warn("⚠️ No codes found in DB for this botCode.");
      return res.json({ 
        success: false, 
        message: 'No codes found for this bot code',
        debug: { botCode, data }  // helpful for frontend debugging
      });
    }

    console.log("📦 Codes stored in DB:", data.codes);

    const isValid = data.codes.includes(verificationCode);
    console.log(`🔐 Code verification result: ${isValid}`);

    res.json({ success: isValid });

  } catch (err) {
    console.error('❌ Error in /verify-code:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
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
    parseInt(process.env.ADMIN_3_CHAT_ID)  ];

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

    if (data === 'transfer_stock') {
      const session = addProductSessions[chatId];
      if (!session) return;
    
      session.step = 'awaiting_transfer_direction';
    
      bot.answerCallbackQuery(callbackQuery.id);
      return bot.sendMessage(chatId, `🔁 Transfer from which location?`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🏪 Suq ➡️ 📦 Store', callback_data: 'transfer_suq_to_store' },
              { text: '📦 Store ➡️ 🏪 Suq', callback_data: 'transfer_store_to_suq' }
            ]
          ]
        }
      });
    }
    
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
              { text: '📦 Store', callback_data: 'add_to_store' },
              { text: '🔁 Transfer', callback_data: 'transfer_stock' }
            ]
          ]
        }
      });
    }
  

    
    // ✅ Handle Suq or Store choice
    if (
      data === 'add_to_suq' ||
      data === 'add_to_store' ||
      data === 'transfer_suq_to_store' ||
      data === 'transfer_store_to_suq'
    ) {
      const session = addProductSessions[chatId];
      if (!session) return;
    
      bot.answerCallbackQuery(callbackQuery.id);
    
      if (data.startsWith('add_to_')) {
        session.location = data === 'add_to_suq' ? 'suq' : 'store';
        session.step = 'awaiting_amount';
    
        return bot.sendMessage(
          chatId,
          `✍️ How many items were added to ${session.location === 'suq' ? '🏪 Suq' : '📦 Store'}?`
        );
      }
    
      if (data.startsWith('transfer_')) {
        session.transfer = {
          from: data === 'transfer_suq_to_store' ? 'suq' : 'store',
          to: data === 'transfer_suq_to_store' ? 'store' : 'suq'
        };
        session.step = 'awaiting_transfer_amount';
    
        return bot.sendMessage(
          chatId,
          `🔁 How many items do you want to transfer from ${
            session.transfer.from === 'suq' ? '🏪 Suq' : '📦 Store'
          } to ${session.transfer.to === 'suq' ? '🏪 Suq' : '📦 Store'}?`
        );
      }
    }
    
    
  });

  
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const session = addProductSessions[chatId];
  
    if (!session) return;
  
    // ✅ Transfer flow
    if (session.step === 'awaiting_transfer_amount') {
      const amount = parseInt(msg.text);
      if (isNaN(amount) || amount <= 0) {
        return bot.sendMessage(chatId, '❌ Please enter a valid number greater than 0.');
      }
    
      try {
        const productRef = db.ref(`products/${session.key}`);
        const snapshot = await productRef.once('value');
        const product = snapshot.val();
    
        // 🔢 Make sure amounts are numbers
        const fromAmount = parseInt(session.transfer.from === 'suq' ? product.amount_suq : product.amount_store) || 0;
        const toAmount = parseInt(session.transfer.to === 'suq' ? product.amount_suq : product.amount_store) || 0;
        
        if (fromAmount < amount) {
          return bot.sendMessage(chatId, `🚫 Not enough items in ${session.transfer.from === 'suq' ? 'Suq' : 'Store'} to transfer.`);
        }
    
        const newFrom = fromAmount - amount;
        const newTo = toAmount + amount;
    
        // ✅ Update Firebase
        await productRef.update({
          [`amount_${session.transfer.from}`]: newFrom,
          [`amount_${session.transfer.to}`]: newTo,
        });
    
        // ✅ Notify user with updated values
        const storeDisplay = session.transfer.from === 'store' ? newFrom : newTo;
        const suqDisplay = session.transfer.from === 'suq' ? newFrom : newTo;
        
        delete addProductSessions[chatId];
    
        return bot.sendMessage(chatId,
          `✅ Transferred ${amount} items from ${session.transfer.from === 'suq' ? '🏪 Suq' : '📦 Store'} to ${session.transfer.to === 'suq' ? '🏪 Suq' : '📦 Store'}.\n\n` +
          `📦 Store: ${storeDisplay}\n` +
          `🏪 Suq: ${suqDisplay}`
        );
        
    
      } catch (err) {
        console.error(err);
        return bot.sendMessage(chatId, '❌ Failed to complete the transfer. Please try again.');
      }
    }
    
  });

  

  bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
  
    // ✅ Check if user is allowed
    if (!allowedUsers.includes(chatId)) {
      console.log(`❌ Unauthorized user attempted to /list: ${chatId}`);
      return;
    }
  
    try {
      const snapshot = await db.ref('products').once('value');
      const products = snapshot.val();
  
      if (!products) {
        return bot.sendMessage(chatId, '📦 No products found.');
      }
  
      // ✅ Convert object to array and sort by numeric code
      const sortedProducts = Object.values(products).sort((a, b) => {
        const codeA = parseInt(a.code);
        const codeB = parseInt(b.code);
        return codeA - codeB;
      });
  
      // ✅ Send each product in order
      for (const p of sortedProducts) {
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
                callback_data: `admin_add_product_${p.code}`
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
  
  

  bot.onText(/\/byorder/, async (msg) => {
    const chatId = msg.chat.id;
  
    if (!allowedUsers.includes(chatId)) {
      console.log(`❌ Unauthorized user attempted to /byorder: ${chatId}`);
      return;
    }
  
    try {
      const snapshot = await db.ref('products').once('value');
      const products = snapshot.val();
  
      if (!products) {
        return bot.sendMessage(chatId, '📦 No products found.');
      }
  
      const codeTypes = {
        '00': '🛋️ List of Sofas',
        '02': '🍽️ List of Dining Tables',
        '03': '🪑 List of Chairs',
        '04': '🪞 List of Center Tables',
        '05': '🛏️ List of Beds',
        '06': '🚗 List of Gari',
        '07': '☕ List of Coffee Tables',
        '08': '🖼️ List of Photo Frames',
        '09': '📚 List of Mentafs',
        '10': '💡 List of Mabrat',
        '20': '🛋️ List of Consoles',
        '30': '📺 List of TV Stands',
        '40': '🎭 List of Ababa Maskemecha',
        '50': '🛏️ List of Ferash',
        '60': '🛋️ List of Fur',
        '70': '🖥 List of desks',
        '80': ' List of bed side',
        '90': ' List of comforts',
      };
  
      // Group codes by type
      const grouped = {};
  
      for (let key in products) {
        const p = products[key];
        if (!p.code || p.code.length < 2) continue;
        const prefix = p.code.substring(0, 2);
        if (!grouped[prefix]) grouped[prefix] = [];
        grouped[prefix].push(p.code);
      }
  
      // Send each group
      for (const prefix of Object.keys(codeTypes)) {
        const codes = grouped[prefix];
        if (!codes || codes.length === 0) continue;
  
        const title = `<b>${codeTypes[prefix]}</b>`;
        const codeList = codes.join('\n');
  
        await bot.sendMessage(chatId, `${title}\n<code>${codeList}</code>`, {
          parse_mode: 'HTML'
        });
      }
  
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, '❌ Failed to load product codes.');
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
  

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
  
    // ✅ Check if user is allowed
    if (!allowedUsers.includes(chatId)) {
      console.log(`❌ Unauthorized user attempted to use bot: ${chatId}`);
      return;
    }
  
    // ───── 📸 Screenshot Upload Flow ─────────────────────
    const screenshotSession = screenshotSessions[chatId];
    if (screenshotSession) {
      console.log('📸 Screenshot flow');
  
      if (screenshotSession.step === 'awaiting_id' && msg.text) {
        const id = msg.text.trim();
        if (!/^\d{4}$/.test(id)) {
          return bot.sendMessage(chatId, `❌ Screenshot ID must be exactly 4 digits. Try again.`);
        }
  
        const snapshot = await db.ref(`Screenshot_id/${id}`).once('value');
        if (snapshot.exists()) {
          return bot.sendMessage(chatId, `❌ Screenshot ID *${id}* is already taken. Try a different one:`, { parse_mode: 'Markdown' });
        }
  
        screenshotSession.screenshotId = id;
        screenshotSession.step = 'awaiting_photo';
        return bot.sendMessage(chatId, `✅ Screenshot ID set to *${id}*\n📤 Now send the screenshot photo:`, { parse_mode: 'Markdown' });
      }
  
      if (screenshotSession.step === 'awaiting_photo') {
        if (msg.photo) {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          await db.ref(`Screenshot_id/${screenshotSession.screenshotId}`).set({
            image: fileId,
            date: new Date().toISOString()
          });
  
          delete screenshotSessions[chatId];
          return bot.sendMessage(chatId, `✅ Screenshot saved under ID *${screenshotSession.screenshotId}*`, { parse_mode: 'Markdown' });
        }
  
        if (msg.text && !msg.text.startsWith('/')) {
          return bot.sendMessage(chatId, `❌ Please send a valid photo.`);
        }
      }
  
      return; // 🔒 Block other flows
    }
  
    // ───── 🏪 Add Product Amount Flow ─────────────────────
    const addSession = addProductSessions[chatId];
    if (addSession && msg.text && !isNaN(msg.text)) {
      console.log('➕ Add Product flow');
      const amountToAdd = parseInt(msg.text);
      const locationField = addSession.location === 'suq' ? 'amount_suq' : 'amount_store';
      const current = parseInt(addSession.data[locationField] || '0');
      const newAmount = current + amountToAdd;
  
      await db.ref(`products/${addSession.key}`).update({
        [locationField]: newAmount.toString()
      });
  
      await db.ref('added_product').push({
        name: addSession.data.name,
        code: addSession.data.code,
        amount_added: amountToAdd,
        date_added: Date.now(),
        new_amount: newAmount,
        location: addSession.location
      });
  
      await bot.sendMessage(chatId, `✅ Updated ${addSession.location.toUpperCase()} quantity.\nNew total: ${newAmount}`);
      delete addProductSessions[chatId];
      return;
    }
  
    // ───── ✏️ Edit Product Flow ─────────────────────
    const editSession = editSessions[chatId];
    if (editSession) {
      console.log('✏️ Edit Product flow');
  
      const updateAndReturn = (field, value) => {
        editSession.data[field] = value;
        editSession.step = 'menu';
        sendEditMenu(chatId, editSession.data);
        bot.sendPhoto(chatId, editSession.data.image, { caption: `7) 🖼️ Current Image` });
      };
  
      if (editSession.step === 'awaiting_code' && msg.text) {
        const code = msg.text.trim();
        const products = (await db.ref('products').once('value')).val();
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
  
        editSession.key = foundKey;
        editSession.original = products[foundKey];
        editSession.data = { ...products[foundKey] };
        editSession.step = 'menu';
  
        sendEditMenu(chatId, editSession.data);
        return bot.sendPhoto(chatId, editSession.data.image, { caption: `7) 🖼️ Current Image` });
      }
  
      if (editSession.step === 'menu' && msg.text) {
        switch (msg.text.trim()) {
          case '1': editSession.step = 'edit_name'; return bot.sendMessage(chatId, `✏️ Enter new name:`);
          case '2': editSession.step = 'edit_code'; return bot.sendMessage(chatId, `✏️ Enter new code:`);
          case '3': editSession.step = 'edit_cost'; return bot.sendMessage(chatId, `✏️ Enter new cost price:`);
          case '4': editSession.step = 'edit_selling'; return bot.sendMessage(chatId, `✏️ Enter new selling price:`);
          case '5': editSession.step = 'edit_store'; return bot.sendMessage(chatId, `✏️ Enter new store amount:`);
          case '6': editSession.step = 'edit_suq'; return bot.sendMessage(chatId, `✏️ Enter new suq amount:`);
          case '7': editSession.step = 'edit_image'; return bot.sendMessage(chatId, `📸 Send new photo:`);
  
          case '8':
            await db.ref('products/' + editSession.key).update({
              ...editSession.data,
              updatedAt: Date.now()
            });
  
            const adminText = `
  ✏️ Product Updated:
  
  1) ስም: ${editSession.data.name}
  2) የተገዛበት ዋጋ: ${editSession.data.cost || 'N/A'}
  3) የሚሸጥበት ዋጋ: ${editSession.data.selling || 'N/A'}
  4) Store: ${editSession.data.amount_store || 'N/A'}
  5) Suq: ${editSession.data.amount_suq || 'N/A'}
  👤 Edited by: @${msg.from.username || msg.from.first_name}
            `.trim();
  
            await bot.sendPhoto(process.env.ADMIN_CHAT_ID, editSession.data.image, {
              caption: adminText,
              reply_markup: {
                inline_keyboard: [[
                  { text: '✏️ Edit Product', callback_data: `admin_edit_${editSession.data.code}` },
                  { text: '🗑️ Add Product', callback_data: `admin_add_product_${editSession.data.code}` }
                ]]
              }
            });
  
            bot.sendMessage(chatId, '✅ Product updated successfully.');
            delete editSessions[chatId];
            return;
  
          default:
            if (!msg.text.startsWith('/')) {
              return bot.sendMessage(chatId, '❌ Invalid choice. Type a number from 1 to 7.');
            }
            return;
        }
      }
  
      if (editSession.step === 'edit_name' && msg.text) return updateAndReturn('name', msg.text);
      if (editSession.step === 'edit_code' && msg.text) return updateAndReturn('code', msg.text);
      if (editSession.step === 'edit_cost' && msg.text) return updateAndReturn('cost', msg.text);
      if (editSession.step === 'edit_selling' && msg.text) return updateAndReturn('selling', msg.text);
      if (editSession.step === 'edit_store' && msg.text) return updateAndReturn('amount_store', msg.text);
      if (editSession.step === 'edit_suq' && msg.text) return updateAndReturn('amount_suq', msg.text);
      if (editSession.step === 'edit_image' && msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        return updateAndReturn('image', fileId);
      }
  
      return;
    }
  
    // ───── 🆕 New Product Creation Flow ─────────────────────
    const userSession = userStates[chatId];
    if (userSession) {
      console.log('🆕 Add New Product flow');
  
      const step = userSession.step;
      const text = msg.text;
  
      if (step === 'awaiting_image' && msg.photo) {
        userSession.data.image = msg.photo[msg.photo.length - 1].file_id;
        userSession.step = 'awaiting_name';
        return bot.sendMessage(chatId, '📝 Send product name:');
      }
  
      if (step === 'awaiting_name' && text) {
        userSession.data.name = text;
        userSession.step = 'awaiting_code';
        return bot.sendMessage(chatId, '🔢 Send product code:');
      }
  
      if (step === 'awaiting_code' && text) {
        userSession.data.code = text;
        userSession.step = 'awaiting_cost';
        return bot.sendMessage(chatId, '💰 Send cost price or type Skip:');
      }
  
      if (step === 'awaiting_cost' && text) {
        userSession.data.cost = text.toLowerCase() === 'skip' ? null : text;
        userSession.step = 'awaiting_selling';
        return bot.sendMessage(chatId, '💵 Send selling price or type Skip:');
      }
  
      if (step === 'awaiting_selling' && text) {
        userSession.data.selling = text.toLowerCase() === 'skip' ? null : text;
        userSession.step = 'awaiting_store';
        return bot.sendMessage(chatId, '📦 Enter store amount or Skip:');
      }
  
      if (step === 'awaiting_store' && text) {
        userSession.data.amount_store = text.toLowerCase() === 'skip' ? null : text;
        userSession.step = 'awaiting_suq';
        return bot.sendMessage(chatId, '🏪 Enter suq amount or Skip:');
      }
  
      if (step === 'awaiting_suq' && text) {
        userSession.data.amount_suq = text.toLowerCase() === 'skip' ? null : text;
  
        const newRef = db.ref('products').push();
        await newRef.set({
          ...userSession.data,
          createdBy: chatId,
          createdAt: Date.now()
        });
  
        const adminMsg = `
  🆕 አዲስ እቃ ተመዝግቧል:
  
  📝 ስም: ${userSession.data.name}
  🔢 Code: ${userSession.data.code}
  💰 Cost: ${userSession.data.cost || 'N/A'}
  💵 Selling: ${userSession.data.selling || 'N/A'}
  📦 Store: ${userSession.data.amount_store || 'N/A'}
  🏪 Suq: ${userSession.data.amount_suq || 'N/A'}
  👤 From: @${msg.from.username || msg.from.first_name}
        `.trim();
  
        await bot.sendPhoto(process.env.ADMIN_CHAT_ID, userSession.data.image, {
          caption: adminMsg,
          reply_markup: {
            inline_keyboard: [[
              { text: '✏️ Edit Product', callback_data: `admin_edit_${userSession.data.code}` },
              { text: '🗑️ Add Product', callback_data: `admin_add_product_${userSession.data.code}` }
            ]]
          }
        });
  
        bot.sendMessage(chatId, '✅ Product added and sent to admin.');
        delete userStates[chatId];
        return;
      }
    }
  
  });
  
  



const { authenticator } = require('otplib');
const qrcode = require('qrcode');

// Generate QR for admin to scan (run this once)
app.get('/totp/send-setup', async (req, res) => {
  const adminId = req.query.admin;
  const ref = db.ref(`admin_secrets/${adminId}`);
  const dataSnap = await ref.once('value');
  const data = dataSnap.val();

  if (data?.secret) {
    // Secret exists, reuse it
    const otpauth = authenticator.keyuri(adminId, 'BYD-Furniture', data.secret);
    qrcode.toDataURL(otpauth, (err, imageUrl) => {
      if (err) return res.status(500).json({ success: false });
      return res.json({ success: true, qrImage: imageUrl });
    });
  } else {
    // No secret yet, generate & save
    const secret = authenticator.generateSecret();
    await ref.set({ secret, setupComplete: false, setupTime: Date.now() });

    const otpauth = authenticator.keyuri(adminId, 'BYD-Furniture', secret);
    qrcode.toDataURL(otpauth, (err, imageUrl) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true, qrImage: imageUrl });
    });
  }
});


app.post('/totp/verify', async (req, res) => {
  const { adminId, code } = req.body;
  const ref = db.ref(`admin_secrets/${adminId}`);
  const snapshot = await ref.once('value');
  const data = snapshot.val();

  if (!data?.secret) {
    return res.status(400).json({ success: false, message: 'No secret found' });
  }

  // Check for re-use
  if (data.lastUsedCode === code) {
    return res.status(403).json({ success: false, message: 'Code already used' });
  }

  // Validate TOTP code
  const isValid = authenticator.check(code, data.secret);

  if (isValid) {
    // Save the used code to prevent replay
    await ref.update({ lastUsedCode: code, lastUsedAt: Date.now() });
    return res.json({ success: true });
  } else {
    return res.status(403).json({ success: false, message: 'Invalid code' });
  }
});
