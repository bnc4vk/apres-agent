import { Router } from "express";
import { loadConversation } from "../conversations/sessionService";
import { getConversationStore } from "../persistence";
import { createSessionCookie, readSessionId } from "../http/sessionCookie";
import { expandItinerary } from "../core/itineraryExpansion";

export const itineraryRouter = Router();

itineraryRouter.post("/expand", async (req, res) => {
  try {
    const sessionId = readSessionId(req.headers.cookie) ?? req.body?.sessionId;
    const itineraryId = req.body?.itineraryId;
    if (!sessionId || !itineraryId) {
      res.status(400).json({ error: "Missing session or itinerary." });
      return;
    }

    const loaded = await loadConversation(sessionId);
    const decision = loaded.conversation.decisionPackage;
    if (!decision) {
      res.status(400).json({ error: "No itinerary available." });
      return;
    }

    const itinerary = decision.itineraries.find((item) => item.id === itineraryId);
    if (!itinerary) {
      res.status(404).json({ error: "Itinerary not found." });
      return;
    }

    const content = expandItinerary(loaded.conversation.tripSpec, itinerary, decision.poiResults);
    const store = getConversationStore();
    const message = { role: "assistant" as const, content };
    await store.appendMessages(loaded.conversation.id, [message]);

    res.setHeader("Set-Cookie", createSessionCookie(loaded.sessionId));
    res.json({
      tripId: loaded.conversation.id,
      messages: [...loaded.messages, message],
      decisionPackage: decision,
      sheetUrl: loaded.conversation.sheetUrl ?? null,
      googleLinked: await store.getGoogleLinked(loaded.session.id)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to expand itinerary." });
  }
});
