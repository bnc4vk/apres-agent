const chat = document.getElementById("chat");
const actions = document.getElementById("actions");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");

let sessionId = null;
let inFlight = false;
const state = {
  decisionPackage: null,
  sheetUrl: null,
  googleLinked: false,
  tripSpec: null
};

async function init() {
  const response = await fetch("/api/session");
  const data = await response.json();
  sessionId = data.sessionId ?? null;
  renderMessages(data.messages ?? []);
  updateState(data);
}

function addMessage(role, content) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = content;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

function renderMessages(messages) {
  chat.innerHTML = "";
  messages.forEach((message) => addMessage(message.role, message.content));
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

function updateState(data) {
  state.decisionPackage = data.decisionPackage ?? null;
  state.sheetUrl = data.sheetUrl ?? null;
  state.googleLinked = Boolean(data.googleLinked);
  state.tripSpec = data.tripSpec ?? state.tripSpec;
  renderActions();
}

function renderActions() {
  actions.innerHTML = "";
  const checklist = renderChecklist();
  if (checklist) actions.appendChild(checklist);
  if (!state.decisionPackage) return;

  const heading = document.createElement("h2");
  heading.textContent = "Itinerary options";
  actions.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "card-grid";
  (state.decisionPackage.itineraries ?? []).forEach((itinerary) => {
    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("h3");
    title.textContent = itinerary.title;
    const summary = document.createElement("p");
    summary.textContent = itinerary.summary;
    const budget = document.createElement("p");
    budget.textContent = itinerary.lodgingBudgetPerPerson
      ? `Lodging target: ~$${itinerary.lodgingBudgetPerPerson} per person`
      : "Lodging target: flexible";
    const links = renderLinkRow(itinerary.researchLinks);
    const button = document.createElement("button");
    button.textContent = "Expand option";
    button.addEventListener("click", () => expandItinerary(itinerary.id));
    card.append(title, summary, budget, links, button);
    grid.appendChild(card);
  });
  actions.appendChild(grid);

  const exportWrap = document.createElement("div");
  if (state.sheetUrl) {
    const link = document.createElement("a");
    link.href = state.sheetUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "sheet-link";
    link.textContent = "Open Google Sheet";
    exportWrap.appendChild(link);
  } else {
    const button = document.createElement("button");
    button.textContent = state.googleLinked ? "Export to Google Sheets" : "Link Google to export";
    button.addEventListener("click", exportToSheets);
    exportWrap.appendChild(button);
  }
  actions.appendChild(exportWrap);
}

function renderChecklist() {
  const missing = state.tripSpec?.status?.missingFields ?? [];
  if (!Array.isArray(missing) || missing.length === 0) return null;
  const box = document.createElement("div");
  box.className = "progress-box";
  const title = document.createElement("h2");
  title.textContent = "Missing info to build itinerary";
  const list = document.createElement("p");
  list.textContent = missing.map(labelForField).join(" • ");
  box.append(title, list);
  return box;
}

function labelForField(field) {
  const labels = {
    dates: "Dates",
    group_size: "Group size",
    skill_levels: "Skill levels",
    gear_rental: "Gear rentals",
    budget: "Budget",
    travel_restrictions: "Travel restrictions",
    location_input: "Location preference",
    traveler_pods: "Departure locations"
  };
  return labels[field] ?? field;
}

function renderLinkRow(researchLinks) {
  const wrap = document.createElement("div");
  wrap.className = "link-row";
  if (!researchLinks) return wrap;
  const entries = [
    { label: "Lodging", href: researchLinks.lodgingSearch },
    { label: "Gear", href: researchLinks.gearSearch },
    { label: "Grocery", href: researchLinks.grocerySearch },
    { label: "Takeout", href: researchLinks.takeoutSearch },
    { label: "Cars", href: researchLinks.carRentalCompare }
  ].filter((entry) => Boolean(entry.href));
  entries.forEach((entry) => {
    const link = document.createElement("a");
    link.href = entry.href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = entry.label;
    wrap.appendChild(link);
  });
  return wrap;
}

async function exportToSheets() {
  if (!state.decisionPackage) return;
  if (!state.googleLinked) {
    window.location.href = "/api/auth/google/start";
    return;
  }
  try {
    const response = await fetch("/api/export/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to export.");
    if (data.sheetUrl) {
      state.sheetUrl = data.sheetUrl;
      renderActions();
      window.open(data.sheetUrl, "_blank", "noopener");
    }
  } catch (error) {
    addMessage("assistant", "Sorry — I couldn't export the sheet yet. Please try again.");
    console.error(error);
  }
}

async function expandItinerary(itineraryId) {
  try {
    const response = await fetch("/api/itinerary/expand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, itineraryId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to expand itinerary.");
    if (data.messages) {
      renderMessages(data.messages);
    } else if (data.reply) {
      addMessage("assistant", data.reply);
    }
    updateState(data);
  } catch (error) {
    addMessage("assistant", "Sorry — I couldn't expand that option yet. Please try again.");
    console.error(error);
  }
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
    sessionId = data.sessionId ?? sessionId;

    const elapsed = performance.now() - startedAt;
    const baseDelayMs = 700;
    const minDelayMs = baseDelayMs * (data.replyKind === "final" ? 2 : 1);
    if (elapsed < minDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, minDelayMs - elapsed));
    }

    typing.remove();
    if (data.messages) {
      renderMessages(data.messages);
    } else {
      addMessage("assistant", data.reply);
    }
    updateState(data);
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
