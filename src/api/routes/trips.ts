import { Response, Router } from "express";
import { createSessionCookie, readSessionId } from "../../http/sessionCookie";
import {
  bootstrapTripChat,
  bootstrapTripSplitwise,
  createTrip,
  getTrip,
  patchTripSpec,
  refreshTripOptions
} from "../../services/tripService";
import { TripSpecPatchSchema } from "../../core/tripSpec";
import { loadConversationByTripId } from "../../conversations/sessionService";
import { exportSheetsForLoadedConversation, HttpRouteError } from "../../services/sheetsExportService";
import { expandItinerary } from "../../core/itineraryExpansion";
import { getConversationStore } from "../../adapters/persistence";
import {
  applyTripWorkflowActions,
  exportTripWorkflowSnapshot,
  refreshTripOperationalWorkflow,
  recomputeTripDecisionPackage,
  validateTripWorkflowLinks
} from "../../services/tripWorkflowService";
import {
  dispatchTripMessagingNudges,
  exportTripCalendarIcs,
  prepareSplitwiseExpensePlan,
  syncTripCalendarToGoogle
} from "../../services/integrationExecutionService";
import { refreshTripOperationalLive } from "../../services/operationalIntelligenceService";

export const tripsRouter = Router();

async function respondWithTripAction(
  res: Response,
  tripId: string,
  action: (tripId: string) => Promise<Awaited<ReturnType<typeof bootstrapTripChat>>>,
  notFoundMessage: string,
  failureMessage: string
) {
  try {
    const trip = await action(tripId);
    if (!trip) {
      res.status(404).json({ error: notFoundMessage });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: failureMessage });
  }
}

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

tripsRouter.post("/:tripId/options/recompute", async (req, res) => {
  try {
    const mode = req.body?.mode === "same_snapshot" ? "same_snapshot" : "refresh_live";
    const trip = await recomputeTripDecisionPackage(req.params.tripId, mode);
    if (!trip) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to recompute trip options." });
  }
});

tripsRouter.post("/:tripId/workflow/actions", async (req, res) => {
  try {
    const actions = Array.isArray(req.body?.actions) ? req.body.actions : [];
    if (actions.length === 0) {
      res.status(400).json({ error: "At least one workflow action is required." });
      return;
    }
    const trip = await applyTripWorkflowActions(req.params.tripId, actions as any);
    if (!trip) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update workflow." });
  }
});

tripsRouter.get("/:tripId/workflow/snapshot", async (req, res) => {
  try {
    const payload = await exportTripWorkflowSnapshot(req.params.tripId);
    if (!payload) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    const format = (req.query?.format ?? "json").toString();
    if (format === "markdown" || format === "md") {
      res.type("text/markdown").send(payload.report.markdown);
      return;
    }
    res.json({ ...payload.trip, snapshotReport: payload.report.json, snapshotMarkdown: payload.report.markdown });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to export workflow snapshot." });
  }
});

tripsRouter.post("/:tripId/integrations/link-health/check", async (req, res) => {
  try {
    const trip = await validateTripWorkflowLinks(req.params.tripId);
    if (!trip) {
      res.status(404).json({ error: "Trip not found or no itinerary available." });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to validate planning links." });
  }
});

tripsRouter.post("/:tripId/operations/refresh", async (req, res) => {
  try {
    const trip =
      req.query?.live === "1"
        ? await refreshTripOperationalLive(req.params.tripId)
        : await refreshTripOperationalWorkflow(req.params.tripId);
    if (!trip) {
      res.status(404).json({ error: "Trip not found or no itinerary available." });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to refresh operational checks." });
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

tripsRouter.post("/:tripId/itineraries/:itineraryId/expand", async (req, res) => {
  try {
    const loaded = await loadConversationByTripId(req.params.tripId);
    if (!loaded) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }

    const decision = loaded.conversation.decisionPackage;
    if (!decision) {
      res.status(400).json({ error: "No itinerary available." });
      return;
    }

    const itinerary = decision.itineraries.find((item) => item.id === req.params.itineraryId);
    if (!itinerary) {
      res.status(404).json({ error: "Itinerary not found." });
      return;
    }

    const content = expandItinerary(loaded.conversation.tripSpec, itinerary, decision.poiResults);
    const store = getConversationStore();
    const message = { role: "assistant" as const, content };
    await store.appendMessages(loaded.conversation.id, [message]);

    res.json({
      tripId: loaded.conversation.id,
      messages: [...loaded.messages, message],
      decisionPackage: decision,
      sheetUrl: loaded.conversation.sheetUrl ?? null,
      googleLinked: loaded.googleLinked
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to expand itinerary." });
  }
});

tripsRouter.post("/:tripId/integrations/splitwise/bootstrap", async (req, res) => {
  await respondWithTripAction(
    res,
    req.params.tripId,
    bootstrapTripSplitwise,
    "Trip not found.",
    "Failed to bootstrap Splitwise."
  );
});

tripsRouter.get("/:tripId/integrations/splitwise/plan", async (req, res) => {
  try {
    const payload = await prepareSplitwiseExpensePlan(req.params.tripId);
    if (!payload) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json({
      tripId: req.params.tripId,
      plannedExpenses: payload.plannedExpenses,
      decisionPackage: payload.decisionPackage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to prepare Splitwise plan." });
  }
});

tripsRouter.post("/:tripId/integrations/chat/bootstrap", async (req, res) => {
  await respondWithTripAction(
    res,
    req.params.tripId,
    bootstrapTripChat,
    "Trip not found.",
    "Failed to bootstrap chat."
  );
});

tripsRouter.post("/:tripId/integrations/chat/notify", async (req, res) => {
  try {
    const rawKinds = Array.isArray(req.body?.kinds) ? req.body.kinds : ["deadline", "vote", "link_refresh"];
    const kinds = rawKinds.filter((kind: unknown) => ["deadline", "vote", "link_refresh"].includes(String(kind))) as Array<
      "deadline" | "vote" | "link_refresh"
    >;
    const payload = await dispatchTripMessagingNudges(req.params.tripId, kinds.length ? kinds : ["deadline", "vote", "link_refresh"]);
    if (!payload) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json({
      tripId: req.params.tripId,
      sentCount: payload.sentCount,
      mode: payload.mode,
      errors: payload.errors,
      messages: payload.messages,
      decisionPackage: payload.decisionPackage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to dispatch workflow reminders." });
  }
});

tripsRouter.get("/:tripId/integrations/calendar.ics", async (req, res) => {
  try {
    const payload = await exportTripCalendarIcs(req.params.tripId);
    if (!payload) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${payload.filename}\"`);
    res.send(payload.ics);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to export calendar ICS." });
  }
});

tripsRouter.post("/:tripId/integrations/calendar/sync", async (req, res) => {
  try {
    const payload = await syncTripCalendarToGoogle(req.params.tripId);
    if (!payload) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }
    res.json({
      tripId: req.params.tripId,
      ok: payload.ok,
      mode: payload.mode,
      insertedCount: payload.insertedCount,
      summary: payload.summary,
      decisionPackage: payload.decisionPackage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to sync trip calendar." });
  }
});

tripsRouter.post("/:tripId/export/sheets", async (req, res) => {
  try {
    const loaded = await loadConversationByTripId(req.params.tripId);
    if (!loaded) {
      res.status(404).json({ error: "Trip not found." });
      return;
    }

    const payload = await exportSheetsForLoadedConversation(loaded);
    res.json({ sheetUrl: payload.sheetUrl, decisionPackage: payload.decisionPackage });
  } catch (error) {
    if (error instanceof HttpRouteError) {
      res.status(error.status).json(error.body);
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Failed to export trip sheet." });
  }
});
