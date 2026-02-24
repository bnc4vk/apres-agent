import { nanoid } from "nanoid";
import { createEmptyTripSpec, TripSpec } from "../../core/tripSpec";
import { ConversationStore, StoredConversation, StoredSession } from "./store";
import { ChatTurn } from "../../conversations/engine";

type MemorySession = StoredSession & { sessionId: string };
type MemoryConversation = StoredConversation;

export class MemoryConversationStore implements ConversationStore {
  private sessions = new Map<string, MemorySession>();
  private conversations = new Map<string, MemoryConversation>();
  private messages = new Map<string, ChatTurn[]>();
  private googleLinked = new Set<string>();

  async getOrCreateSession(sessionId?: string | null): Promise<StoredSession> {
    if (sessionId && this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }
    const newSessionId = nanoid();
    const session: MemorySession = {
      id: nanoid(),
      sessionId: newSessionId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      lastSeenAt: new Date().toISOString()
    };
    this.sessions.set(newSessionId, session);
    return session;
  }

  async getSessionByPk(sessionPk: string): Promise<StoredSession | null> {
    const session = [...this.sessions.values()].find((item) => item.id === sessionPk);
    return session ?? null;
  }

  async getOrCreateConversation(sessionPk: string): Promise<StoredConversation> {
    const existing = [...this.conversations.values()].find((conv) => conv.sessionPk === sessionPk);
    if (existing) return existing;
    const conversation: MemoryConversation = {
      id: nanoid(),
      sessionPk,
      tripSpec: createEmptyTripSpec(),
      decisionPackage: null,
      sheetUrl: null
    };
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return conversation;
  }

  async getConversationById(conversationId: string): Promise<StoredConversation | null> {
    return this.conversations.get(conversationId) ?? null;
  }

  async listMessages(conversationId: string): Promise<ChatTurn[]> {
    return this.messages.get(conversationId) ?? [];
  }

  async appendMessages(conversationId: string, messages: ChatTurn[]): Promise<void> {
    const existing = this.messages.get(conversationId) ?? [];
    this.messages.set(conversationId, [...existing, ...messages]);
  }

  async resetConversation(conversationId: string, tripSpec: TripSpec, messages: ChatTurn[]): Promise<void> {
    const existing = this.conversations.get(conversationId);
    if (!existing) return;
    this.conversations.set(conversationId, {
      ...existing,
      tripSpec,
      decisionPackage: null,
      sheetUrl: null
    });
    this.messages.set(conversationId, [...messages]);
  }

  async updateConversation(
    conversationId: string,
    patch: Partial<Pick<StoredConversation, "tripSpec" | "decisionPackage" | "sheetUrl">>
  ): Promise<void> {
    const existing = this.conversations.get(conversationId);
    if (!existing) return;
    const next = { ...existing };
    if (patch.tripSpec) next.tripSpec = patch.tripSpec;
    if (Object.prototype.hasOwnProperty.call(patch, "decisionPackage")) {
      next.decisionPackage = patch.decisionPackage ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "sheetUrl")) {
      next.sheetUrl = patch.sheetUrl ?? null;
    }
    this.conversations.set(conversationId, next);
  }

  async getGoogleLinked(sessionPk: string): Promise<boolean> {
    return this.googleLinked.has(sessionPk);
  }
}
