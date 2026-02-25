import type { DecisionPackage } from "../../core/decision";
import type { TripSpec } from "../../core/tripSpec";
import type { ChatTurn } from "../../conversations/types";

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
  getSessionByPk(sessionPk: string): Promise<StoredSession | null>;
  getOrCreateConversation(sessionPk: string): Promise<StoredConversation>;
  getConversationById(conversationId: string): Promise<StoredConversation | null>;
  listMessages(conversationId: string): Promise<ChatTurn[]>;
  appendMessages(conversationId: string, messages: ChatTurn[]): Promise<void>;
  resetConversation(conversationId: string, tripSpec: TripSpec, messages: ChatTurn[]): Promise<void>;
  updateConversation(
    conversationId: string,
    patch: Partial<Pick<StoredConversation, "tripSpec" | "decisionPackage" | "sheetUrl">>
  ): Promise<void>;
  getGoogleLinked(sessionPk: string): Promise<boolean>;
};
