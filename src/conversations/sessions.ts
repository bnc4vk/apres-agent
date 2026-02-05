import { ChatSession, createSession } from "./engine";

const sessions = new Map<string, ChatSession>();

export function getOrCreateSession(sessionId?: string): ChatSession {
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }
  const session = createSession();
  sessions.set(session.id, session);
  return session;
}

export function saveSession(session: ChatSession): void {
  sessions.set(session.id, session);
}
