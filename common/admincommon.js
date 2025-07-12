const sessionStartauth = localStorage.getItem("sessionStartauth");
const now = Date.now();
const FOUR_MINUTES = 60 * 60 * 1000;

if (!sessionStartauth || now - parseInt(sessionStartauth) > FOUR_MINUTES) {
  // session expired or not found
  localStorage.removeItem("sessionStartauth");
  window.location.href = "../Admin_pannel/auth_page.html";
} else {
  // Optional: set timer to auto-logout exactly at the 4-minute mark
  setTimeout(() => {
    localStorage.removeItem("sessionStartauth");
    window.location.href = "../Admin_pannel/auth_page.html";
  }, FOUR_MINUTES - (now - parseInt(sessionStartauth)));
}
document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("sessionStartauth");  // 🧼 Clear the session
    window.location.href = "../Admin_pannel/auth_page.html";   // 🔁 Redirect to login
  });

//  const expectedKey = "8799000055468";
//  const currentKey = localStorage.getItem("deviceKey");



bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;

  // Clear any ongoing state
  delete userStates[chatId];
  delete editSessions?.[chatId]; // if you're also using editSessions or similar

  bot.sendMessage(chatId, '🚫 Operation cancelled. You can now enter a new command.');
});
