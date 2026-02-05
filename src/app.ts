import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { handleUserMessage } from "./conversations/engine";
import { getOrCreateSession, saveSession } from "./conversations/sessions";

export const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(publicDir));

app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body ?? {};
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  const session = getOrCreateSession(sessionId);
  const updatedSession = await handleUserMessage(session, message);
  saveSession(updatedSession);

  const reply = updatedSession.history[updatedSession.history.length - 1]?.content ?? "";
  const replyKind = updatedSession.decisionPackage ? "final" : "followup";

  res.json({
    sessionId: updatedSession.id,
    reply,
    replyKind,
    tripSpec: updatedSession.tripSpec,
    decisionPackage: updatedSession.decisionPackage ?? null
  });
});

app.get("/api/session", (_req, res) => {
  const session = getOrCreateSession();
  res.json({ sessionId: session.id, welcome: session.history[0]?.content });
});
