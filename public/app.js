const chat = document.getElementById("chat");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");

let sessionId = localStorage.getItem("skiPlannerSessionId");
let inFlight = false;

async function init() {
  const response = await fetch("/api/session");
  const data = await response.json();
  sessionId = data.sessionId;
  localStorage.setItem("skiPlannerSessionId", sessionId);
  if (data.welcome) {
    addMessage("assistant", data.welcome);
  }
}

function addMessage(role, content) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = content;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

function addTypingIndicator() {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant typing";
  bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

function setFormEnabled(enabled) {
  input.disabled = !enabled;
  form.querySelector("button").disabled = !enabled;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (inFlight) return;
  const message = input.value.trim();
  if (!message) return;
  addMessage("user", message);
  input.value = "";

  inFlight = true;
  setFormEnabled(false);
  const typing = addTypingIndicator();
  const startedAt = performance.now();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message })
    });
    const data = await response.json();
    sessionId = data.sessionId;
    localStorage.setItem("skiPlannerSessionId", sessionId);

    const elapsed = performance.now() - startedAt;
    const baseDelayMs = 700;
    const minDelayMs = baseDelayMs * (data.replyKind === "final" ? 2 : 1);
    if (elapsed < minDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, minDelayMs - elapsed));
    }

    typing.remove();
    addMessage("assistant", data.reply);
  } catch (error) {
    typing.remove();
    addMessage("assistant", "Sorry — something went wrong. Please try again.");
    console.error(error);
  } finally {
    inFlight = false;
    setFormEnabled(true);
    input.focus();
  }
});

init();
