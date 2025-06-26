const sessionStart = localStorage.getItem("sessionStart");
const now = Date.now();
const FOUR_MINUTES = 4 * 60 * 1000;

if (!sessionStart || now - parseInt(sessionStart) > FOUR_MINUTES) {
  // session expired or not found
  localStorage.removeItem("sessionStart");
  window.location.href = "../index.html";
} else {
  // Optional: set timer to auto-logout exactly at the 4-minute mark
  setTimeout(() => {
    localStorage.removeItem("sessionStart");
    window.location.href = "../index.html";
  }, FOUR_MINUTES - (now - parseInt(sessionStart)));
}
document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("sessionStart");  // 🧼 Clear the session
    window.location.href = "../index.html";   // 🔁 Redirect to login
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
