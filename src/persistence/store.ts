import { DecisionPackage } from "../core/decision";
import { TripSpec } from "../core/tripSpec";
import { ChatTurn } from "../conversations/engine";

export type StoredSession = {
  id: string;
  sessionId: string;
  expiresAt?: string;
  lastSeenAt?: string;
};

export type StoredConversation = {
  id: string;
  sessionPk: string;
  tripSpec: TripSpec;
  decisionPackage: DecisionPackage | null;
  sheetUrl: string | null;
};

export type ConversationSnapshot = {
  session: StoredSession;
  conversation: StoredConversation;
  messages: ChatTurn[];
  googleLinked: boolean;
};

export type ConversationStore = {
  getOrCreateSession(sessionId?: string | null): Promise<StoredSession>;
  getOrCreateConversation(sessionPk: string): Promise<StoredConversation>;
  listMessages(conversationId: string): Promise<ChatTurn[]>;
  appendMessages(conversationId: string, messages: ChatTurn[]): Promise<void>;
  updateConversation(
    conversationId: string,
    patch: Partial<Pick<StoredConversation, "tripSpec" | "decisionPackage" | "sheetUrl">>
  ): Promise<void>;
  getGoogleLinked(sessionPk: string): Promise<boolean>;
};
