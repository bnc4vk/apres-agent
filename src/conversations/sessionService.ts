import { getConversationStore } from "../adapters/persistence";
import { WELCOME_MESSAGE } from "./welcome";
import { ConversationSnapshot } from "../adapters/persistence/store";
import { createEmptyTripSpec } from "../core/tripSpec";

export type LoadedConversation = ConversationSnapshot & {
  sessionId: string;
};

export async function loadConversation(sessionId?: string | null): Promise<LoadedConversation> {
  const store = getConversationStore();
  const session = await store.getOrCreateSession(sessionId);
  const conversation = await store.getOrCreateConversation(session.id);
  let messages = await store.listMessages(conversation.id);

  if (messages.length === 0) {
    const welcome = { role: "assistant" as const, content: WELCOME_MESSAGE };
    await store.appendMessages(conversation.id, [welcome]);
    messages = [welcome];
  }

  const googleLinked = await store.getGoogleLinked(session.id);

  return {
    session,
    sessionId: session.sessionId,
    conversation,
    messages,
    googleLinked
  };
}

export async function loadConversationByTripId(tripId: string): Promise<LoadedConversation | null> {
  const store = getConversationStore();
  const conversation = await store.getConversationById(tripId);
  if (!conversation) return null;
  const session = await store.getSessionByPk(conversation.sessionPk);
  if (!session) return null;
  const messages = await store.listMessages(conversation.id);
  const googleLinked = await store.getGoogleLinked(conversation.sessionPk);

  return {
    session,
    sessionId: session.sessionId,
    conversation,
    messages,
    googleLinked
  };
}

export async function resetConversationForNewChat(
  loaded: LoadedConversation
): Promise<LoadedConversation> {
  const store = getConversationStore();
  const freshSpec = createEmptyTripSpec();
  const welcome = [{ role: "assistant" as const, content: WELCOME_MESSAGE }];
  await store.resetConversation(loaded.conversation.id, freshSpec, welcome);
  return {
    ...loaded,
    conversation: {
      ...loaded.conversation,
      tripSpec: freshSpec,
      decisionPackage: null,
      sheetUrl: null
    },
    messages: welcome
  };
}
