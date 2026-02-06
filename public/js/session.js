export async function fetchSession() {
  const response = await fetch("/api/session");
  return response.json();
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

export async function requestItineraryExpansion(sessionId, itineraryId) {
  const response = await fetch("/api/itinerary/expand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, itineraryId })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to expand itinerary.");
  return data;
}

export async function requestSheetsExport(sessionId) {
  const response = await fetch("/api/export/sheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to export.");
  return data;
}
