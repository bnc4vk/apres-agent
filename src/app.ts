import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { appConfig } from "./config/appConfig";
import { handleUserMessage } from "./conversations/engine";
import {
  loadConversation,
  resetConversationForNewChat,
  toChatSession
} from "./conversations/sessionService";
import { clearSessionCookie, createSessionCookie, readSessionId } from "./http/sessionCookie";
import { getConversationStore } from "./persistence";
import { googleAuthRouter } from "./routes/googleAuth";
import { sheetsExportRouter } from "./routes/sheetsExport";
import { itineraryRouter } from "./routes/itinerary";
import { tripsRouter } from "./routes/trips";

export const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(publicDir));
app.use("/api/auth/google", googleAuthRouter);
app.use("/api/export", sheetsExportRouter);
app.use("/api/itinerary", itineraryRouter);
app.use("/api/trips", tripsRouter);

app.post("/api/chat", async (req, res) => {
  const { message } = req.body ?? {};
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  try {
    const store = getConversationStore();
    const loaded = await loadConversation(resolveSessionId(req));
    const active = loaded;
    const chatSession = toChatSession(active);
    const previousCount = chatSession.history.length;
    const updatedSession = await handleUserMessage(chatSession, message);
    const newMessages = updatedSession.history.slice(previousCount);

    await store.appendMessages(active.conversation.id, newMessages);
    const decisionPackage = updatedSession.decisionPackage ?? active.conversation.decisionPackage ?? null;
    await store.updateConversation(active.conversation.id, {
      tripSpec: updatedSession.tripSpec,
      decisionPackage
    });

    const reply = updatedSession.history[updatedSession.history.length - 1]?.content ?? "";
    const replyKind = updatedSession.decisionPackage ? "final" : "followup";

    setSessionCookie(res, active.sessionId);
    res.json({
      sessionId: active.sessionId,
      tripId: active.conversation.id,
      reply,
      replyKind,
      tripSpec: updatedSession.tripSpec,
      decisionPackage: decisionPackage ?? null,
      messages: updatedSession.history
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to handle message." });
  }
});

app.post("/api/session/new", async (req, res) => {
  try {
    const loaded = await loadConversation(resolveSessionId(req));
    const reset = await resetConversationForNewChat(loaded);
    setSessionCookie(res, reset.sessionId);
    res.json({
      sessionId: reset.sessionId,
      tripId: reset.conversation.id,
      messages: reset.messages,
      tripSpec: reset.conversation.tripSpec,
      decisionPackage: null,
      sheetUrl: null,
      googleLinked: reset.googleLinked
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to start a new chat." });
  }
});

app.get("/api/session", (_req, res) => {
  const sessionId = appConfig.chatPersistenceEnabled ? readSessionId(_req.headers.cookie) : null;
  loadConversation(sessionId)
    .then((loaded) => {
      setSessionCookie(res, loaded.sessionId);
      res.json({
        sessionId: loaded.sessionId,
        tripId: loaded.conversation.id,
        messages: loaded.messages,
        tripSpec: loaded.conversation.tripSpec,
        decisionPackage: loaded.conversation.decisionPackage ?? null,
        sheetUrl: loaded.conversation.sheetUrl ?? null,
        googleLinked: loaded.googleLinked
      });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ error: "Failed to load session." });
    });
});

function resolveSessionId(req: express.Request): string | null {
  const bodySessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : null;
  if (!appConfig.chatPersistenceEnabled) {
    return bodySessionId;
  }
  const cookieSessionId = readSessionId(req.headers.cookie);
  return cookieSessionId ?? bodySessionId;
}

function setSessionCookie(res: express.Response, sessionId: string): void {
  if (appConfig.chatPersistenceEnabled) {
    res.setHeader("Set-Cookie", createSessionCookie(sessionId));
    return;
  }
  res.setHeader("Set-Cookie", clearSessionCookie());
}
