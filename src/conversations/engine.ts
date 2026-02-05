import { DecisionPackage } from "../core/decision";
import { TripSpec, createEmptyTripSpec } from "../core/tripSpec";
import { runChatGraph } from "../graph/chatGraph";
import { getLLMClient } from "../llm/factory";
import { ChatMessage } from "../llm/types";
import { WELCOME_MESSAGE } from "./welcome";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatSession = {
  id: string;
  tripSpec: TripSpec;
  history: ChatTurn[];
  decisionPackage?: DecisionPackage;
};

export function createSession(): ChatSession {
  const spec = createEmptyTripSpec();
  return {
    id: spec.id,
    tripSpec: spec,
    history: [
      {
        role: "assistant",
        content: WELCOME_MESSAGE
      }
    ]
  };
}

export async function handleUserMessage(
  session: ChatSession,
  message: string
): Promise<ChatSession> {
  const llm = getLLMClient();
  const messages = toLLMMessages(session.history);

  const result = await runChatGraph(llm, {
    tripSpec: session.tripSpec,
    messages,
    userMessage: message
  });

  session.tripSpec = result.tripSpec;
  session.history = fromLLMMessages(result.messages);
  session.decisionPackage = result.decisionPackage ?? undefined;
  return session;
}

function toLLMMessages(history: ChatTurn[]): ChatMessage[] {
  return history.map((turn) => ({ role: turn.role, content: turn.content }));
}

function fromLLMMessages(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content
    }));
}
