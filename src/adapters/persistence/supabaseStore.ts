import { nanoid } from "nanoid";
import { supabaseAdmin } from "./supabaseClient";
import type { ConversationStore, StoredConversation, StoredSession } from "./store";
import type { ChatTurn } from "../../conversations/types";
import { createEmptyTripSpec, normalizeTripSpec } from "../../core/tripSpec";
import type { TripSpec } from "../../core/tripSpec";

type ConversationRow = {
  id: string;
  session_pk: string;
  trip_spec: any;
  decision_package: any;
  sheet_url: string | null;
};

export class SupabaseConversationStore implements ConversationStore {
  async getOrCreateSession(sessionId?: string | null): Promise<StoredSession> {
    if (sessionId) {
      const existing = await supabaseAdmin
        .from("app_sessions")
        .select("id, session_id, expires_at, last_seen_at")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (existing.data) {
        return {
          id: existing.data.id,
          sessionId: existing.data.session_id,
          expiresAt: existing.data.expires_at,
          lastSeenAt: existing.data.last_seen_at
        };
      }
    }

    const newSessionId = nanoid();
    const inserted = await supabaseAdmin
      .from("app_sessions")
      .insert({ session_id: newSessionId })
      .select("id, session_id, expires_at, last_seen_at")
      .single();

    if (inserted.error || !inserted.data) {
      throw new Error(inserted.error?.message ?? "Failed to create session.");
    }

    return {
      id: inserted.data.id,
      sessionId: inserted.data.session_id,
      expiresAt: inserted.data.expires_at,
      lastSeenAt: inserted.data.last_seen_at
    };
  }

  async getSessionByPk(sessionPk: string): Promise<StoredSession | null> {
    const response = await supabaseAdmin
      .from("app_sessions")
      .select("id, session_id, expires_at, last_seen_at")
      .eq("id", sessionPk)
      .maybeSingle();

    if (!response.data) return null;
    return {
      id: response.data.id,
      sessionId: response.data.session_id,
      expiresAt: response.data.expires_at,
      lastSeenAt: response.data.last_seen_at
    };
  }

  async getOrCreateConversation(sessionPk: string): Promise<StoredConversation> {
    const existing = await supabaseAdmin
      .from("app_conversations")
      .select("id, session_pk, trip_spec, decision_package, sheet_url")
      .eq("session_pk", sessionPk)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.data) {
      return this.mapConversation(existing.data);
    }

    const tripSpec = createEmptyTripSpec();
    const inserted = await supabaseAdmin
      .from("app_conversations")
      .insert({
        session_pk: sessionPk,
        trip_spec: tripSpec,
        decision_package: null,
        sheet_url: null
      })
      .select("id, session_pk, trip_spec, decision_package, sheet_url")
      .single();

    if (inserted.error || !inserted.data) {
      throw new Error(inserted.error?.message ?? "Failed to create conversation.");
    }

    return this.mapConversation(inserted.data);
  }

  async getConversationById(conversationId: string): Promise<StoredConversation | null> {
    const existing = await supabaseAdmin
      .from("app_conversations")
      .select("id, session_pk, trip_spec, decision_package, sheet_url")
      .eq("id", conversationId)
      .maybeSingle();
    if (!existing.data) return null;
    return this.mapConversation(existing.data);
  }

  async listMessages(conversationId: string): Promise<ChatTurn[]> {
    const response = await supabaseAdmin
      .from("app_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.data ?? []).map((row) => ({
      role: row.role,
      content: row.content
    }));
  }

  async appendMessages(conversationId: string, messages: ChatTurn[]): Promise<void> {
    if (messages.length === 0) return;
    const payload = messages.map((message) => ({
      conversation_id: conversationId,
      role: message.role,
      content: message.content
    }));
    const response = await supabaseAdmin.from("app_messages").insert(payload);
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async resetConversation(conversationId: string, tripSpec: TripSpec, messages: ChatTurn[]): Promise<void> {
    const resetResponse = await supabaseAdmin
      .from("app_conversations")
      .update({
        trip_spec: tripSpec,
        decision_package: null,
        sheet_url: null
      })
      .eq("id", conversationId);
    if (resetResponse.error) {
      throw new Error(resetResponse.error.message);
    }

    const deleteResponse = await supabaseAdmin
      .from("app_messages")
      .delete()
      .eq("conversation_id", conversationId);
    if (deleteResponse.error) {
      throw new Error(deleteResponse.error.message);
    }

    await this.appendMessages(conversationId, messages);
  }

  async updateConversation(
    conversationId: string,
    patch: Partial<Pick<StoredConversation, "tripSpec" | "decisionPackage" | "sheetUrl">>
  ): Promise<void> {
    const updatePayload: Record<string, unknown> = {};
    if (patch.tripSpec) updatePayload.trip_spec = patch.tripSpec;
    if (patch.decisionPackage !== undefined) updatePayload.decision_package = patch.decisionPackage;
    if (patch.sheetUrl !== undefined) updatePayload.sheet_url = patch.sheetUrl;

    if (Object.keys(updatePayload).length === 0) return;
    const response = await supabaseAdmin
      .from("app_conversations")
      .update(updatePayload)
      .eq("id", conversationId);

    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async getGoogleLinked(sessionPk: string): Promise<boolean> {
    const response = await supabaseAdmin
      .from("app_google_tokens")
      .select("session_pk")
      .eq("session_pk", sessionPk)
      .limit(1)
      .maybeSingle();
    return Boolean(response.data);
  }

  private mapConversation(row: ConversationRow): StoredConversation {
    return {
      id: row.id,
      sessionPk: row.session_pk,
      tripSpec: normalizeTripSpec(row.trip_spec ?? createEmptyTripSpec()),
      decisionPackage: row.decision_package ?? null,
      sheetUrl: row.sheet_url ?? null
    };
  }
}
