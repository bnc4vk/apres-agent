import { Router } from "express";
import { createOAuthClient } from "../integrations/googleAuth";
import { createSheetForTrip } from "../integrations/googleSheets";
import { getGoogleRefreshToken } from "../persistence/googleTokens";
import { createSessionCookie, readSessionId } from "../http/sessionCookie";
import {
  bootstrapTripChat,
  bootstrapTripSplitwise,
  createTrip,
  getTrip,
  patchTripSpec,
  refreshTripOptions
} from "../core/trips";
import { TripSpecPatchSchema } from "../core/tripSpec";
import { loadConversationByTripId } from "../conversations/sessionService";
import { getConversationStore } from "../persistence";

export const tripsRouter = Router();

tripsRouter.post("/", async (req, res) => {
  try {
    const sessionId = readSessionId(req.headers.cookie) ?? req.body?.sessionId ?? null;
    const trip = await createTrip(sessionId);
    if (trip.sessionId) {
      res.setHeader("Set-Cookie", createSessionCookie(trip.sessionId));
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create trip." });
  }
});

tripsRouter.patch("/:tripId/spec", async (req, res) => {
  try {
    const parse = TripSpecPatchSchema.safeParse(req.body ?? {});
    if (!parse.success) {
      res.status(400).json({ error: "Invalid trip patch." });
      return;
    }
    const trip = await patchTripSpec(req.params.tripId, parse.data);
    if (!trip) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to patch trip spec." });
  }
});

tripsRouter.post("/:tripId/options/refresh", async (req, res) => {
  try {
    const trip = await refreshTripOptions(req.params.tripId);
    if (!trip) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to refresh trip options." });
  }
});

tripsRouter.get("/:tripId/options", async (req, res) => {
  try {
    const trip = await getTrip(req.params.tripId);
    if (!trip) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json({
      tripId: trip.tripId,
      tripSpec: trip.tripSpec,
      decisionPackage: trip.decisionPackage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load trip options." });
  }
});

tripsRouter.post("/:tripId/integrations/splitwise/connect", async (req, res) => {
  try {
    const trip = await bootstrapTripSplitwise(req.params.tripId);
    if (!trip) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to connect Splitwise." });
  }
});

tripsRouter.post("/:tripId/integrations/splitwise/bootstrap", async (req, res) => {
  try {
    const trip = await bootstrapTripSplitwise(req.params.tripId);
    if (!trip) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to bootstrap Splitwise." });
  }
});

tripsRouter.post("/:tripId/integrations/chat/bootstrap", async (req, res) => {
  try {
    const trip = await bootstrapTripChat(req.params.tripId);
    if (!trip) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to bootstrap chat." });
  }
});

tripsRouter.post("/:tripId/export/sheets", async (req, res) => {
  try {
    const loaded = await loadConversationByTripId(req.params.tripId);
    if (!loaded) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }

    const decisionPackage = loaded.conversation.decisionPackage;
    if (!decisionPackage) {
      res.status(400).json({ error: "No itinerary available to export." });
      return;
    }

    const refreshToken = await getGoogleRefreshToken(loaded.conversation.sessionPk);
    if (!refreshToken) {
      res.status(401).json({ error: "Google not linked.", authRequired: true });
      return;
    }

    const client = createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const sheet = await createSheetForTrip(client, loaded.conversation.tripSpec, decisionPackage);
    await getConversationStore().updateConversation(loaded.conversation.id, { sheetUrl: sheet.sheetUrl });
    res.json({ sheetUrl: sheet.sheetUrl, decisionPackage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to export trip sheet." });
  }
});
