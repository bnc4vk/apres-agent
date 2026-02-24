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
