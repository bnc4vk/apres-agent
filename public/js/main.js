import {
  applyWorkflowActions,
  bootstrapSplitwise,
  bootstrapTripChat,
  createTripRecord,
  exportTripSheets,
  exportWorkflowSnapshot,
  fetchSplitwisePlan,
  fetchFieldLabels,
  fetchSession,
  getTripCalendarIcsUrl,
  patchTripSpec,
  recomputeTripOptions,
  refreshOperations,
  refreshOperationsLive,
  refreshTripOptions,
  requestItineraryExpansion,
  requestNewChat,
  sendWorkflowNotifications,
  syncTripCalendar,
  validateLinkHealth
} from "./session.js";
import { createRenderer } from "./renderers.js";

const experienceRoot = document.getElementById("experience-root");
const intakeScreen = document.getElementById("intake-screen");
const loadingScreen = document.getElementById("loading-screen");
const resultsScreen = document.getElementById("results-screen");
const intakeForm = document.getElementById("trip-intake-form");
const intakeError = document.getElementById("intake-error");
const generateBtn = document.getElementById("generate-itineraries-btn");
const loadingStatusText = document.getElementById("loading-status-text");
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
let currentScreen = "intake";
let loadingTicker = null;

const LOADING_MESSAGES = [
  "Reviewing trip constraints and building ranked itinerary candidates.",
  "Checking resort fit, budget tradeoffs, and group skill alignment.",
  "Assembling itinerary options with lodging, travel, and activity recommendations."
];

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
  onRecompute: handleRecompute,
  onWorkflowActions: handleWorkflowActions,
  onExportSnapshot: handleExportSnapshot,
  onValidateLinks: handleValidateLinks,
  onRefreshOperations: handleRefreshOperations,
  onRefreshOperationsLive: handleRefreshOperationsLive,
  onSyncCalendar: handleSyncCalendar,
  onExportCalendarIcs: handleExportCalendarIcs,
  onPreviewSplitwisePlan: handlePreviewSplitwisePlan,
  onSendReminders: handleSendReminders,
  onApplyTemplate: handleApplyTemplate,
  fieldLabels: sharedFieldLabels,
  focusMode: true
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
  hydrateIntakeForm(state.tripSpec);

  if (googleStatus === "blocked") {
    renderer.appendGoogleBlockedMessage(googleReason);
  }

  intakeForm?.addEventListener("submit", onGenerateSubmit);
  form?.addEventListener("submit", onDisabledRefineSubmit);
  if (newChatBtn) newChatBtn.addEventListener("click", startNewChat);

  setExperienceScreen(state.decisionPackage ? "results" : "intake");
  syncRefinementChatUi();
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
  if ("decisionPackage" in (data ?? {})) {
    state.decisionPackage = data.decisionPackage ?? null;
  }
  if ("sheetUrl" in (data ?? {})) {
    state.sheetUrl = data.sheetUrl ?? null;
  }
  if (typeof data.googleLinked === "boolean") {
    state.googleLinked = data.googleLinked;
  }
  state.tripSpec = data.tripSpec ?? state.tripSpec;

  renderer.renderActions(state);
  renderer.updateInputHint(state);
  renderer.updateHeaderCta(state);
  syncRefinementChatUi();
  syncHeaderCopy();
}

function setBusy(busy) {
  inFlight = busy;
  renderer.setFormEnabled(!busy);
  setIntakeFormBusy(busy);
  syncRefinementChatUi();
}

function onDisabledRefineSubmit(event) {
  event.preventDefault();
}

async function startNewChat() {
  if (inFlight) return;
  setBusy(true);
  try {
    const data = await requestNewChat(sessionId);
    sessionId = data.sessionId ?? sessionId;
    tripId = data.tripId ?? tripId;
    renderer.renderMessages([]);
    updateState({ ...data, tripId });
    hydrateIntakeForm(data.tripSpec ?? state.tripSpec);
    clearIntakeError();
    setExperienceScreen("intake");
  } catch (error) {
    showIntakeError("Couldn't start a new trip right now.");
    console.error(error);
  } finally {
    setBusy(false);
    focusPrimaryIntakeField();
  }
}

async function onGenerateSubmit(event) {
  event.preventDefault();
  if (inFlight || !tripId) return;

  clearIntakeError();
  const parsed = buildTripPatchFromIntakeForm();
  if (!parsed.ok) {
    showIntakeError(parsed.error);
    return;
  }

  setExperienceScreen("loading");
  startLoadingTicker();
  setBusy(true);
  const startedAt = performance.now();

  try {
    const patched = await patchTripSpec(tripId, parsed.patch);
    updateState({
      tripId: patched.tripId ?? tripId,
      tripSpec: patched.tripSpec,
      decisionPackage: patched.decisionPackage ?? state.decisionPackage,
      sheetUrl: "sheetUrl" in patched ? patched.sheetUrl : state.sheetUrl,
      googleLinked: typeof patched.googleLinked === "boolean" ? patched.googleLinked : state.googleLinked
    });

    const generated = await refreshTripOptions(tripId);
    const elapsed = performance.now() - startedAt;
    if (elapsed < 1200) {
      await new Promise((resolve) => setTimeout(resolve, 1200 - elapsed));
    }

    updateState({
      tripId: generated.tripId ?? tripId,
      decisionPackage: generated.decisionPackage,
      tripSpec: generated.tripSpec,
      sheetUrl: "sheetUrl" in generated ? generated.sheetUrl : state.sheetUrl,
      googleLinked: typeof generated.googleLinked === "boolean" ? generated.googleLinked : state.googleLinked
    });
    renderer.addMessage("assistant", "Generated itinerary candidates from structured trip inputs.");
    setExperienceScreen("results");
  } catch (error) {
    console.error(error);
    setExperienceScreen("intake");
    showIntakeError("Itinerary generation failed. Check the fields and try again.");
  } finally {
    stopLoadingTicker();
    setBusy(false);
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

async function handleRecompute(mode) {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await recomputeTripOptions(tripId, mode || "refresh_live");
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: data.tripSpec,
      sheetUrl: data.sheetUrl ?? state.sheetUrl,
      googleLinked: typeof data.googleLinked === "boolean" ? data.googleLinked : state.googleLinked
    });
    renderer.addMessage(
      "assistant",
      mode === "same_snapshot"
        ? "Recomputed workflow using the same data snapshot."
        : "Recomputed with refreshed live data."
    );
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't recompute trip options right now.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleWorkflowActions(actions, successMessage) {
  if (!tripId || inFlight || !Array.isArray(actions) || actions.length === 0) return;
  setBusy(true);
  try {
    const data = await applyWorkflowActions(tripId, actions);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: data.tripSpec,
      sheetUrl: data.sheetUrl ?? state.sheetUrl,
      googleLinked: typeof data.googleLinked === "boolean" ? data.googleLinked : state.googleLinked
    });
    if (successMessage) renderer.addMessage("assistant", successMessage);
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't update the workflow right now.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleExportSnapshot() {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await exportWorkflowSnapshot(tripId);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: data.tripSpec,
      sheetUrl: data.sheetUrl ?? state.sheetUrl,
      googleLinked: typeof data.googleLinked === "boolean" ? data.googleLinked : state.googleLinked
    });
    if (data.snapshotMarkdown) {
      renderer.addMessage("assistant", `Workflow snapshot exported.\n\n${data.snapshotMarkdown}`);
    } else {
      renderer.addMessage("assistant", "Workflow snapshot exported.");
    }
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't export a workflow snapshot right now.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleValidateLinks() {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await validateLinkHealth(tripId);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: data.tripSpec,
      sheetUrl: data.sheetUrl ?? state.sheetUrl,
      googleLinked: typeof data.googleLinked === "boolean" ? data.googleLinked : state.googleLinked
    });
    renderer.addMessage("assistant", "Validated planning link health.");
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't validate planning links right now.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleRefreshOperations() {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await refreshOperations(tripId);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: data.tripSpec,
      sheetUrl: data.sheetUrl ?? state.sheetUrl,
      googleLinked: typeof data.googleLinked === "boolean" ? data.googleLinked : state.googleLinked
    });
    renderer.addMessage("assistant", "Refreshed operational readiness checks.");
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't refresh operational checks.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleRefreshOperationsLive() {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await refreshOperationsLive(tripId);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: data.tripSpec,
      sheetUrl: data.sheetUrl ?? state.sheetUrl,
      googleLinked: typeof data.googleLinked === "boolean" ? data.googleLinked : state.googleLinked
    });
    renderer.addMessage("assistant", "Ran live operational checks (forecast/roads/lift status/airport timing).");
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't run live operational checks.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleSyncCalendar() {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await syncTripCalendar(tripId);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: state.tripSpec,
      sheetUrl: state.sheetUrl,
      googleLinked: state.googleLinked
    });
    renderer.addMessage("assistant", data.summary || "Calendar sync updated.");
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't sync the trip calendar.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

function handleExportCalendarIcs() {
  if (!tripId) return;
  window.open(getTripCalendarIcsUrl(tripId), "_blank", "noopener");
}

async function handlePreviewSplitwisePlan() {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await fetchSplitwisePlan(tripId);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: state.tripSpec,
      sheetUrl: state.sheetUrl,
      googleLinked: state.googleLinked
    });
    const lines = (data.plannedExpenses || [])
      .slice(0, 6)
      .map((item) => `- ${item.description}: $${item.amountUsd} (${item.category}) owner ${item.payerDefault}`);
    renderer.addMessage("assistant", `Prepared Splitwise expense plan.\n${lines.join("\n")}`);
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't prepare the Splitwise plan.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleSendReminders() {
  if (!tripId || inFlight) return;
  setBusy(true);
  try {
    const data = await sendWorkflowNotifications(tripId);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage,
      tripSpec: state.tripSpec,
      sheetUrl: state.sheetUrl,
      googleLinked: state.googleLinked
    });
    renderer.addMessage(
      "assistant",
      `${data.mode === "live" ? "Sent" : "Simulated"} ${data.sentCount} workflow reminder message(s).`
    );
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't dispatch workflow reminders.");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function handleApplyTemplate(template) {
  if (!tripId || !template?.patch || inFlight) return;
  setBusy(true);
  try {
    const data = await patchTripSpec(tripId, template.patch);
    updateState({
      tripId: data.tripId ?? tripId,
      decisionPackage: data.decisionPackage ?? state.decisionPackage,
      tripSpec: data.tripSpec,
      sheetUrl: data.sheetUrl ?? state.sheetUrl,
      googleLinked: typeof data.googleLinked === "boolean" ? data.googleLinked : state.googleLinked
    });
    renderer.addMessage("assistant", `Applied template: ${template.name}.`);
  } catch (error) {
    renderer.addMessage("assistant", "Couldn't apply that template.");
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

function setExperienceScreen(screen) {
  currentScreen = screen;
  if (experienceRoot) experienceRoot.dataset.screen = screen;
  if (intakeScreen) intakeScreen.hidden = screen !== "intake";
  if (loadingScreen) loadingScreen.hidden = screen !== "loading";
  if (resultsScreen) resultsScreen.hidden = screen !== "results";
  syncHeaderCopy();
}

function syncHeaderCopy() {
  if (!pageSubhead) return;
  if (currentScreen === "loading") {
    pageSubhead.textContent = "Generating ranked itinerary options from your trip constraints.";
    return;
  }
  if (currentScreen === "results") {
    pageSubhead.textContent = "Review generated itineraries first. Chat refinements will be re-enabled after itinerary quality improvements.";
    return;
  }
  pageSubhead.textContent = "Enter trip details up front so the model can spend time on itinerary reasoning instead of back-and-forth intake.";
}

function syncRefinementChatUi() {
  if (!form || !input || !sendBtn) return;
  form.setAttribute("aria-disabled", "true");
  form.classList.add("is-disabled");
  input.disabled = true;
  sendBtn.disabled = true;
  input.placeholder =
    "Refinements coming soon (e.g., 'make option 2 cheaper and more beginner-friendly')";
  sendBtn.textContent = "Refine (Soon)";
}

function setIntakeFormBusy(busy) {
  if (!intakeForm) return;
  const controls = intakeForm.querySelectorAll("input, select, textarea, button");
  controls.forEach((el) => {
    if (el.id === "chat-input") return;
    if (el.id === "generate-itineraries-btn" || el.closest("#trip-intake-form")) {
      el.disabled = busy;
    }
  });
  if (generateBtn) {
    generateBtn.disabled = busy;
    generateBtn.textContent = busy ? "Generating..." : "Generate itineraries";
  }
}

function startLoadingTicker() {
  stopLoadingTicker();
  let index = 0;
  if (loadingStatusText) loadingStatusText.textContent = LOADING_MESSAGES[index];
  loadingTicker = window.setInterval(() => {
    index = (index + 1) % LOADING_MESSAGES.length;
    if (loadingStatusText) loadingStatusText.textContent = LOADING_MESSAGES[index];
  }, 1500);
}

function stopLoadingTicker() {
  if (loadingTicker) {
    window.clearInterval(loadingTicker);
    loadingTicker = null;
  }
}

function showIntakeError(message) {
  if (!intakeError) return;
  intakeError.hidden = false;
  intakeError.textContent = message;
}

function clearIntakeError() {
  if (!intakeError) return;
  intakeError.hidden = true;
  intakeError.textContent = "";
}

function focusPrimaryIntakeField() {
  const target = document.getElementById("trip-start-date");
  if (target instanceof HTMLElement && typeof target.focus === "function") {
    target.focus();
  }
}

function buildTripPatchFromIntakeForm() {
  if (!intakeForm) {
    return { ok: false, error: "Trip form is unavailable." };
  }

  const fd = new FormData(intakeForm);
  const start = String(fd.get("start_date") || "").trim();
  const end = String(fd.get("end_date") || "").trim();
  const groupSize = parseOptionalNumber(fd.get("group_size"));
  const perPersonMax = parseOptionalNumber(fd.get("budget_per_person"));
  const budgetBand = String(fd.get("budget_band") || "").trim();
  const roomingStyle = String(fd.get("rooming_style") || "").trim();
  const travelMode = String(fd.get("travel_mode") || "flexible");
  const arrivalAirport = String(fd.get("arrival_airport") || "").trim();
  const destinationPreference = String(fd.get("destination_preference") || "").trim();
  const maxDriveHours = parseOptionalNumber(fd.get("max_drive_hours"));
  const minBedrooms = parseOptionalNumber(fd.get("min_bedrooms"));
  const maxWalkMinutes = parseOptionalNumber(fd.get("max_walk_minutes"));
  const rentalCount = parseOptionalNumber(fd.get("rental_count"));
  const rentalRequiredRaw = String(fd.get("rental_required") || "unknown");
  const lodgingConstraintModeRaw = String(fd.get("lodging_constraint_mode") || "soft");
  const plannerNotes = String(fd.get("planner_notes") || "").trim();
  const passPreset = String(fd.get("pass_preset") || "unknown");
  const passNotes = String(fd.get("pass_notes") || "").trim();
  const openToSuggestions = fd.get("open_to_suggestions") === "on";
  const hotTubRequired = fd.get("hot_tub_required") === "on";
  const kitchenRequired = fd.get("kitchen_required") === "on";
  const laundryRequired = fd.get("laundry_required") === "on";
  const skillLevels = intakeFormSkillLevels();

  if (!start || !end) {
    return { ok: false, error: "Start and end dates are required." };
  }
  if (!groupSize || groupSize < 1) {
    return { ok: false, error: "Group size must be at least 1." };
  }
  if (!Array.isArray(skillLevels) || skillLevels.length === 0) {
    return { ok: false, error: "Select at least one skill level for the group." };
  }
  if (!perPersonMax || perPersonMax < 1) {
    return { ok: false, error: "Enter a per-person budget." };
  }
  if (!openToSuggestions && !destinationPreference) {
    return { ok: false, error: "Add a destination/region preference or enable destination suggestions." };
  }

  const dayCount = calculateTripLengthDays(start, end);
  if (!dayCount || dayCount < 1) {
    return { ok: false, error: "End date must be on or after start date." };
  }

  const patch = {
    group: {
      size: groupSize,
      skillLevels,
      notes: plannerNotes || undefined
    },
    groupComposition: {
      roomingStyle: roomingStyle || undefined,
      confirmed: Boolean(roomingStyle) || undefined
    },
    gear: buildGearPatch(rentalRequiredRaw, rentalCount),
    budget: {
      perPersonMax,
      band: budgetBand || undefined,
      currency: "USD",
      confirmed: true
    },
    travel: {
      noFlying: travelMode === "drive_only",
      maxDriveHours: maxDriveHours || undefined,
      arrivalAirport: arrivalAirport || undefined,
      confirmed: true
    },
    dates: {
      start,
      end,
      kind: "exact",
      tripLengthDays: dayCount,
      yearConfirmed: true
    },
    location: {
      region: destinationPreference || undefined,
      openToSuggestions,
      confirmed: true
    },
    lodgingConstraints: {
      constraintMode: lodgingConstraintModeRaw === "none" ? undefined : lodgingConstraintModeRaw,
      minBedrooms: minBedrooms || undefined,
      maxWalkMinutesToLift: maxWalkMinutes || undefined,
      hotTubRequired: hotTubRequired || undefined,
      kitchenRequired: kitchenRequired || undefined,
      laundryRequired: laundryRequired || undefined,
      confirmed: lodgingConstraintModeRaw === "hard" ? true : undefined
    },
    organizerOps: {
      confirmed: true
    },
    travelers:
      travelMode === "drive_only" || Boolean(maxDriveHours)
        ? {
            pods: [{ origin: arrivalAirport || "Shared departure area", count: groupSize }]
          }
        : undefined,
    notes: {
      passes: buildPassPatch(passPreset, passNotes, groupSize)
    }
  };

  return { ok: true, patch };
}

function intakeFormSkillLevels() {
  if (!intakeForm) return [];
  return Array.from(intakeForm.querySelectorAll("input[name='skill_levels']:checked"))
    .map((el) => el.value)
    .filter(Boolean);
}

function buildGearPatch(rentalRequiredRaw, rentalCount) {
  if (rentalRequiredRaw === "yes") {
    return {
      rentalRequired: true,
      rentalCount: rentalCount || undefined,
      confirmed: true
    };
  }
  if (rentalRequiredRaw === "no") {
    return {
      rentalRequired: false,
      confirmed: true
    };
  }
  return {
    rentalCount: rentalCount || undefined,
    confirmed: true
  };
}

function buildPassPatch(passPreset, passNotes, groupSize) {
  if (passPreset === "ikon") {
    return {
      ikonCount: groupSize,
      notes: passNotes || "Mostly Ikon passholders.",
      confirmed: true
    };
  }
  if (passPreset === "epic") {
    return {
      epicCount: groupSize,
      notes: passNotes || "Mostly Epic passholders.",
      confirmed: true
    };
  }
  if (passPreset === "mixed") {
    return {
      notes: passNotes || "Mixed pass ownership in the group.",
      confirmed: true
    };
  }
  if (passPreset === "unknown") {
    return {
      notes: passNotes || "Pass ownership is unknown.",
      confirmed: true
    };
  }
  return {
    noPassCount: groupSize,
    notes: passNotes || "No ski passes owned.",
    confirmed: true
  };
}

function hydrateIntakeForm(spec) {
  if (!intakeForm) return;
  intakeForm.reset();

  if (!spec) return;

  setFormControlValue("start_date", spec.dates?.start || "");
  setFormControlValue("end_date", spec.dates?.end || "");
  setFormControlValue("group_size", spec.group?.size ?? "");
  setFormControlValue("budget_per_person", spec.budget?.perPersonMax ?? "");
  setFormControlValue("budget_band", spec.budget?.band || "mid");
  setFormControlValue("rooming_style", spec.groupComposition?.roomingStyle || "");
  setFormControlValue("arrival_airport", spec.travel?.arrivalAirport || "");
  setFormControlValue("destination_preference", spec.location?.resort || spec.location?.region || "");
  setFormControlValue("max_drive_hours", spec.travel?.maxDriveHours ?? "");
  setFormControlValue("min_bedrooms", spec.lodgingConstraints?.minBedrooms ?? "");
  setFormControlValue("max_walk_minutes", spec.lodgingConstraints?.maxWalkMinutesToLift ?? "");
  setFormControlValue("rental_count", spec.gear?.rentalCount ?? "");
  setFormControlValue("planner_notes", spec.group?.notes || "");
  setFormControlValue("pass_notes", spec.notes?.passes?.notes || "");

  setCheckboxValue("open_to_suggestions", spec.location?.openToSuggestions ?? true);
  setCheckboxValue("hot_tub_required", Boolean(spec.lodgingConstraints?.hotTubRequired));
  setCheckboxValue("kitchen_required", spec.lodgingConstraints?.kitchenRequired ?? true);
  setCheckboxValue("laundry_required", Boolean(spec.lodgingConstraints?.laundryRequired));

  const travelMode = spec.travel?.noFlying ? "drive_only" : "flexible";
  setFormControlValue("travel_mode", travelMode);

  const rentalRequired =
    spec.gear?.rentalRequired === true ? "yes" : spec.gear?.rentalRequired === false ? "no" : "unknown";
  setFormControlValue("rental_required", rentalRequired);

  const lodgingMode = spec.lodgingConstraints?.constraintMode || "soft";
  setFormControlValue("lodging_constraint_mode", lodgingMode);

  const preset = inferPassPreset(spec);
  setFormControlValue("pass_preset", preset);

  const selectedSkills = new Set(
    Array.isArray(spec.group?.skillLevels) && spec.group.skillLevels.length > 0
      ? spec.group.skillLevels
      : ["intermediate", "advanced"]
  );
  intakeForm.querySelectorAll("input[name='skill_levels']").forEach((el) => {
    el.checked = selectedSkills.has(el.value);
  });
}

function inferPassPreset(spec) {
  const passes = spec?.notes?.passes;
  const groupSize = spec?.group?.size;
  if (!passes) return "none";
  if (groupSize && passes.ikonCount && passes.ikonCount >= groupSize) return "ikon";
  if (groupSize && passes.epicCount && passes.epicCount >= groupSize) return "epic";
  if (groupSize && passes.noPassCount && passes.noPassCount >= groupSize) return "none";
  if (passes.notes && /unknown/i.test(passes.notes)) return "unknown";
  if (passes.notes || passes.otherPasses?.length) return "mixed";
  return "unknown";
}

function setFormControlValue(name, value) {
  if (!intakeForm) return;
  const field = intakeForm.elements.namedItem(name);
  if (!field) return;
  if ("value" in field) {
    field.value = value == null ? "" : String(value);
  }
}

function setCheckboxValue(name, checked) {
  if (!intakeForm) return;
  const field = intakeForm.elements.namedItem(name);
  if (field && "checked" in field) {
    field.checked = Boolean(checked);
  }
}

function parseOptionalNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.round(parsed);
}

function calculateTripLengthDays(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;
  const deltaMs = endDate.getTime() - startDate.getTime();
  const days = Math.floor(deltaMs / (24 * 60 * 60 * 1000)) + 1;
  return days > 0 ? days : undefined;
}
