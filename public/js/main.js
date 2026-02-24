import {
  bootstrapSplitwise,
  bootstrapTripChat,
  createTripRecord,
  exportTripSheets,
  fetchFieldLabels,
  fetchSession,
  patchTripSpec,
  refreshTripOptions,
  requestItineraryExpansion,
  requestNewChat,
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
let tripId = null;
let inFlight = false;
const state = {
  tripId: null,
  decisionPackage: null,
  sheetUrl: null,
  googleLinked: false,
  tripSpec: null
};

let googleStatus = null;
let googleReason = null;
const sharedFieldLabels = {};

const renderer = createRenderer({
  chat,
  actions,
  input,
  newChatBtn,
  sendBtn,
  pageSubhead,
  onExpand: expandItinerary,
  onExport: exportToSheets,
  onRefresh: handleRefreshOptions,
  onLock: handleLockItinerary,
  onBootstrapSplitwise: handleBootstrapSplitwise,
  onBootstrapChat: handleBootstrapChat,
  fieldLabels: sharedFieldLabels
});

export async function initApp() {
  parseGoogleStatus();
  try {
    Object.assign(sharedFieldLabels, await fetchFieldLabels());
  } catch (error) {
    console.warn("Failed to load field labels", error);
  }
  const data = await fetchSession();
  sessionId = data.sessionId ?? null;
  tripId = data.tripId ?? null;

  if (!tripId) {
    const trip = await createTripRecord(sessionId);
    tripId = trip.tripId ?? tripId;
  }
  renderer.renderMessages(data.messages ?? []);
  updateState({ ...data, tripId });

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
  state.tripId = data.tripId ?? state.tripId;
  tripId = state.tripId;
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
    tripId = data.tripId ?? tripId;

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
    updateState({ ...data, tripId });
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
    tripId = data.tripId ?? tripId;
    renderer.renderMessages(data.messages ?? []);
    updateState({ ...data, tripId });
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't start a new chat right now.");
    console.error(error);
  } finally {
    setBusy(false);
    input.focus();
  }
}

async function expandItinerary(itineraryId) {
  if (!tripId) return;
  try {
    const data = await requestItineraryExpansion(tripId, itineraryId);
    if (data.messages) {
      renderer.renderMessages(data.messages);
    } else if (data.reply) {
      renderer.addMessage("assistant", data.reply);
    }
    updateState({ ...data, tripId: data.tripId ?? tripId });
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
    if (!state.tripId) throw new Error("Missing trip.");
    const data = await exportTripSheets(state.tripId);
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

async function handleRefreshOptions() {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await refreshTripOptions(tripId);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: data.tripSpec,
      sheetUrl: state.sheetUrl,
      googleLinked: state.googleLinked
    });
    renderer.addMessage("assistant", "Refreshed live options and scoring.");
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't refresh options right now.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleLockItinerary(itinerary) {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    await patchTripSpec(tripId, {
      locks: {
        lockedItineraryId: itinerary.id,
        lockedResortName: itinerary.resortName,
        lockedStartDate: itinerary.dateRange?.start,
        lockedEndDate: itinerary.dateRange?.end
      }
    });
    const refreshed = await refreshTripOptions(tripId);
    updateState({
      tripId: refreshed.tripId ?? tripId,
      decisionPackage: refreshed.decisionPackage,
      tripSpec: refreshed.tripSpec,
      sheetUrl: state.sheetUrl,
      googleLinked: state.googleLinked
    });
    renderer.addMessage("assistant", `Locked ${itinerary.resortName} and recomputed remaining options.`);
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't lock that option yet.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleBootstrapSplitwise() {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await bootstrapSplitwise(tripId);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: data.tripSpec,
      sheetUrl: state.sheetUrl,
      googleLinked: state.googleLinked
    });
    renderer.addMessage("assistant", "Splitwise bootstrap completed for this trip.");
  } catch (error) {
    renderer.addMessage("assistant", "Splitwise bootstrap failed.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleBootstrapChat() {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await bootstrapTripChat(tripId);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: data.tripSpec,
      sheetUrl: state.sheetUrl,
      googleLinked: state.googleLinked
    });
    renderer.addMessage("assistant", "Group chat bootstrap completed for this trip.");
  } catch (error) {
    renderer.addMessage("assistant", "Group chat bootstrap failed.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}
