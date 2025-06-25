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
  