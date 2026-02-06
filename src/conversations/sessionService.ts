import { ChatSession } from "./engine";
import { getConversationStore } from "../persistence";
import { WELCOME_MESSAGE } from "./welcome";
import { ConversationSnapshot } from "../persistence/store";
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

export function toChatSession(conversation: LoadedConversation): ChatSession {
  return {
    id: conversation.conversation.id,
    tripSpec: conversation.conversation.tripSpec,
    history: conversation.messages,
    decisionPackage: conversation.conversation.decisionPackage ?? undefined
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
