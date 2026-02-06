import {
  fetchSession,
  requestItineraryExpansion,
  requestNewChat,
  requestSheetsExport,
  sendChatMessage
} from "./session.js";
import { createRenderer } from "./renderers.js";

const chat = document.getElementById("chat");
const actions = document.getElementById("actions");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const newChatBtn = document.getElementById("new-chat-btn");
const sendBtn = form?.querySelector("button[type='submit']");
const pageSubhead = document.getElementById("page-subhead");

let sessionId = null;
let inFlight = false;
const state = {
  decisionPackage: null,
  sheetUrl: null,
  googleLinked: false,
  tripSpec: null
};

let googleStatus = null;
let googleReason = null;

const renderer = createRenderer({
  chat,
  actions,
  input,
  newChatBtn,
  sendBtn,
  pageSubhead,
  onExpand: expandItinerary,
  onExport: exportToSheets
});

export async function initApp() {
  parseGoogleStatus();
  const data = await fetchSession();
  sessionId = data.sessionId ?? null;
  renderer.renderMessages(data.messages ?? []);
  updateState(data);

  if (googleStatus === "blocked") {
    renderer.appendGoogleBlockedMessage(googleReason);
  }

  form.addEventListener("submit", onSubmit);
  if (newChatBtn) newChatBtn.addEventListener("click", startNewChat);
}

function parseGoogleStatus() {
  const params = new URLSearchParams(window.location.search);
  const google = params.get("google");
  googleReason = params.get("reason");

  if (google === "blocked") googleStatus = "blocked";
  if (google === "linked") googleStatus = "linked";

  if (google) {
    params.delete("google");
    params.delete("reason");
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", next);
  }
}

function updateState(data) {
  state.decisionPackage = data.decisionPackage ?? null;
  state.sheetUrl = data.sheetUrl ?? null;
  state.googleLinked = Boolean(data.googleLinked);
  state.tripSpec = data.tripSpec ?? state.tripSpec;

  renderer.renderActions(state);
  renderer.updateInputHint(state);
  renderer.updateHeaderCta(state);
}

function setBusy(busy) {
  inFlight = busy;
  renderer.setFormEnabled(!busy);
}

async function onSubmit(event) {
  event.preventDefault();
  if (inFlight) return;

  const message = input.value.trim();
  if (!message) return;

  renderer.addMessage("user", message);
  input.value = "";

  setBusy(true);
  const typing = renderer.addTypingIndicator();
  const startedAt = performance.now();

  try {
    const data = await sendChatMessage(sessionId, message);
    sessionId = data.sessionId ?? sessionId;

    const elapsed = performance.now() - startedAt;
    const minDelayMs = data.replyKind === "final" ? 1200 : 650;
    if (elapsed < minDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, minDelayMs - elapsed));
    }

    typing.remove();
    if (data.messages) {
      renderer.renderMessages(data.messages);
    } else {
      renderer.addMessage("assistant", data.reply);
    }
    updateState(data);
  } catch (error) {
    typing.remove();
    renderer.addMessage("assistant", "Something went wrong. Please try again.");
    console.error(error);
  } finally {
    setBusy(false);
    input.focus();
  }
}

async function startNewChat() {
  if (inFlight) return;
  setBusy(true);
  try {
    const data = await requestNewChat(sessionId);
    sessionId = data.sessionId ?? sessionId;
    renderer.renderMessages(data.messages ?? []);
    updateState(data);
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't start a new chat right now.");
    console.error(error);
  } finally {
    setBusy(false);
    input.focus();
  }
}

async function expandItinerary(itineraryId) {
  try {
    const data = await requestItineraryExpansion(sessionId, itineraryId);
    if (data.messages) {
      renderer.renderMessages(data.messages);
    } else if (data.reply) {
      renderer.addMessage("assistant", data.reply);
    }
    updateState(data);
  } catch (error) {
    renderer.addMessage("assistant", "I couldn't expand that option yet. Please try again.");
    console.error(error);
  }
}

async function exportToSheets() {
  if (!state.decisionPackage) return;
  if (!state.googleLinked) {
    window.location.href = "/api/auth/google/start";
    return;
  }

  try {
    const data = await requestSheetsExport(sessionId);
    if (data.sheetUrl) {
      state.sheetUrl = data.sheetUrl;
      renderer.renderActions(state);
      window.open(data.sheetUrl, "_blank", "noopener");
    }
  } catch (error) {
    renderer.addMessage("assistant", "I couldn't export the sheet yet. Please try again.");
    console.error(error);
  }
}
