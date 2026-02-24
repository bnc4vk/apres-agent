import { mergeTripSpec, TripSpec, TripSpecPatch } from "./tripSpec";
import { buildDecisionPackage, DecisionPackage } from "./decision";
import { loadConversation, loadConversationByTripId } from "../conversations/sessionService";
import { getConversationStore } from "../persistence";
import { bootstrapSplitwiseGroup } from "../integrations/splitwise";
import { bootstrapConversation } from "../integrations/twilioConversations";

export type TripRecord = {
  tripId: string;
  sessionId: string;
  tripSpec: TripSpec;
  decisionPackage: DecisionPackage | null;
};

export async function createTrip(sessionId?: string | null): Promise<TripRecord> {
  const loaded = await loadConversation(sessionId);
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage: loaded.conversation.decisionPackage
  };
}

export async function getTrip(tripId: string): Promise<TripRecord | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage: loaded.conversation.decisionPackage
  };
}

export async function patchTripSpec(tripId: string, patch: TripSpecPatch): Promise<TripRecord | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;

  const nextSpec = mergeTripSpec(loaded.conversation.tripSpec, patch);
  const store = getConversationStore();
  await store.updateConversation(loaded.conversation.id, { tripSpec: nextSpec });
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: nextSpec,
    decisionPackage: loaded.conversation.decisionPackage
  };
}

export async function refreshTripOptions(tripId: string): Promise<TripRecord | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const decisionPackage = await buildDecisionPackage(loaded.conversation.tripSpec);
  const store = getConversationStore();
  await store.updateConversation(loaded.conversation.id, { decisionPackage });
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage
  };
}

export async function bootstrapTripSplitwise(tripId: string): Promise<TripRecord | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const decisionPackage = loaded.conversation.decisionPackage ?? (await buildDecisionPackage(loaded.conversation.tripSpec));
  const summary = decisionPackage.budgetSummary;
  const seededExpenses = [
    { description: "Lodging deposit", cost: Math.max(1, Math.round(summary.bestGroupTotal * 0.25)) },
    { description: "Lift access", cost: Math.max(1, Math.round(summary.bestGroupTotal * 0.21)) },
    { description: "Travel", cost: Math.max(1, Math.round(summary.bestGroupTotal * 0.18)) },
    { description: "Food", cost: Math.max(1, Math.round(summary.bestGroupTotal * 0.16)) },
    { description: "Gear rental", cost: Math.max(1, Math.round(summary.bestGroupTotal * 0.1)) }
  ];
  const result = await bootstrapSplitwiseGroup({
    tripName: `Apres ${decisionPackage.resortShortlist[0] ?? "Trip"}`,
    currencyCode: loaded.conversation.tripSpec.budget.currency ?? "USD",
    members: [{ name: "Organizer" }],
    seededExpenses
  });

  decisionPackage.opsBoard.splitwiseBootstrap = {
    enabled: true,
    groupId: result.groupId,
    status: result.ok ? "ready" : "pending"
  };

  const store = getConversationStore();
  await store.updateConversation(loaded.conversation.id, { decisionPackage });
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage
  };
}

export async function bootstrapTripChat(tripId: string): Promise<TripRecord | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const decisionPackage = loaded.conversation.decisionPackage ?? (await buildDecisionPackage(loaded.conversation.tripSpec));
  const result = await bootstrapConversation({
    tripName: `Apres ${decisionPackage.resortShortlist[0] ?? "Trip"} Group Chat`,
    participants: [{ identity: "organizer" }]
  });

  decisionPackage.opsBoard.chatBootstrap = {
    enabled: true,
    provider: "twilio",
    inviteUrl: result.inviteUrl
  };

  const store = getConversationStore();
  await store.updateConversation(loaded.conversation.id, { decisionPackage });
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage
  };
}
