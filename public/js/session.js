export async function fetchSession() {
  const response = await fetch("/api/session");
  return response.json();
}

export async function fetchFieldLabels() {
  const response = await fetch("/api/meta/field-labels");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load field labels.");
  return data.fieldLabels ?? {};
}

export async function sendChatMessage(sessionId, message) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to send message.");
  return data;
}

export async function requestNewChat(sessionId) {
  const response = await fetch("/api/session/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to start new chat.");
  return data;
}

export async function requestItineraryExpansion(tripId, itineraryId) {
  const response = await fetch(
    `/api/trips/${encodeURIComponent(tripId)}/itineraries/${encodeURIComponent(itineraryId)}/expand`,
    {
      method: "POST"
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to expand itinerary.");
  return data;
}

export async function createTripRecord(sessionId) {
  const response = await fetch("/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to create trip.");
  return data;
}

export async function refreshTripOptions(tripId) {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/options/refresh`, {
    method: "POST"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to refresh options.");
  return data;
}

export async function recomputeTripOptions(tripId, mode = "refresh_live") {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/options/recompute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to recompute trip options.");
  return data;
}

export async function patchTripSpec(tripId, patch) {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/spec`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to patch trip.");
  return data;
}

export async function applyWorkflowActions(tripId, actions) {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/workflow/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actions })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to update workflow.");
  return data;
}

export async function exportWorkflowSnapshot(tripId) {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/workflow/snapshot`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to export workflow snapshot.");
  return data;
}

export async function validateLinkHealth(tripId) {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/integrations/link-health/check`, {
    method: "POST"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to validate links.");
  return data;
}

export async function refreshOperations(tripId) {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/operations/refresh`, {
    method: "POST"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to refresh operations.");
  return data;
}

export async function bootstrapSplitwise(tripId) {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/integrations/splitwise/bootstrap`, {
    method: "POST"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to bootstrap Splitwise.");
  return data;
}

export async function bootstrapTripChat(tripId) {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/integrations/chat/bootstrap`, {
    method: "POST"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to bootstrap chat.");
  return data;
}

export async function exportTripSheets(tripId) {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/export/sheets`, {
    method: "POST"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to export trip sheet.");
  return data;
}
