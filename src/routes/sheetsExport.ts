import { Router } from "express";
import { createOAuthClient } from "../integrations/googleAuth";
import { createSheetForTrip } from "../core/sheets";
import { getGoogleRefreshToken } from "../persistence/googleTokens";
import { loadConversation } from "../conversations/sessionService";
import { getConversationStore } from "../persistence";
import { createSessionCookie, readSessionId } from "../http/sessionCookie";

export const sheetsExportRouter = Router();

sheetsExportRouter.post("/sheets", async (req, res) => {
  try {
    const sessionId = readSessionId(req.headers.cookie) ?? req.body?.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: "Missing session." });
      return;
    }

    const loaded = await loadConversation(sessionId);
    const decisionPackage = loaded.conversation.decisionPackage;
    if (!decisionPackage) {
      res.status(400).json({ error: "No itinerary available to export." });
      return;
    }

    const refreshToken = await getGoogleRefreshToken(loaded.session.id);
    if (!refreshToken) {
      res.status(401).json({ error: "Google not linked.", authRequired: true });
      return;
    }

    const client = createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const sheet = await createSheetForTrip(client, loaded.conversation.tripSpec, decisionPackage);

    const store = getConversationStore();
    await store.updateConversation(loaded.conversation.id, { sheetUrl: sheet.sheetUrl });

    res.setHeader("Set-Cookie", createSessionCookie(loaded.sessionId));
    res.json({
      sheetUrl: sheet.sheetUrl,
      decisionPackage,
      googleLinked: true
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to export sheet." });
  }
});
