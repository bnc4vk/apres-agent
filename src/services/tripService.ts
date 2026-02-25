import { mergeTripSpec, TripSpec, TripSpecPatch } from "../core/tripSpec";
import { buildDecisionPackage, DecisionPackage } from "../core/decision";
import { loadConversation, loadConversationByTripId } from "../conversations/sessionService";
import { getConversationStore } from "../adapters/persistence";
import { bootstrapSplitwiseGroup } from "../adapters/integrations/splitwise";
import { bootstrapConversation } from "../adapters/integrations/twilioConversations";
import { enrichDecisionPackageWithLLMReview } from "./decisionReviewService";
import { finalizeDecisionPackageForTripSpec } from "./tripWorkflowService";

export type TripRecord = {
  tripId: string;
  sessionId: string;
  tripSpec: TripSpec;
  decisionPackage: DecisionPackage | null;
};

export async function createTrip(sessionId?: string | null): Promise<TripRecord> {
  const loaded = await loadConversation(sessionId);
  const decisionPackage = loaded.conversation.decisionPackage
    ? finalizeDecisionPackageForTripSpec(loaded.conversation.tripSpec, loaded.conversation.decisionPackage, {
        previousDecisionPackage: loaded.conversation.decisionPackage,
        trigger: "workflow_refresh"
      })
    : null;
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage
  };
}

export async function getTrip(tripId: string): Promise<TripRecord | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const decisionPackage = loaded.conversation.decisionPackage
    ? finalizeDecisionPackageForTripSpec(loaded.conversation.tripSpec, loaded.conversation.decisionPackage, {
        previousDecisionPackage: loaded.conversation.decisionPackage,
        trigger: "workflow_refresh"
      })
    : null;
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage
  };
}

export async function patchTripSpec(tripId: string, patch: TripSpecPatch): Promise<TripRecord | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;

  const nextSpec = mergeTripSpec(loaded.conversation.tripSpec, patch);
  const decisionPackage = loaded.conversation.decisionPackage
    ? finalizeDecisionPackageForTripSpec(nextSpec, loaded.conversation.decisionPackage, {
        previousDecisionPackage: loaded.conversation.decisionPackage,
        trigger: "workflow_refresh"
      })
    : null;
  const store = getConversationStore();
  await store.updateConversation(loaded.conversation.id, { tripSpec: nextSpec, decisionPackage });
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: nextSpec,
    decisionPackage
  };
}

export async function refreshTripOptions(tripId: string): Promise<TripRecord | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const decisionPackage = await enrichDecisionPackageWithLLMReview(
    loaded.conversation.tripSpec,
    await buildDecisionPackage(loaded.conversation.tripSpec)
  );
  const workflowDecision = finalizeDecisionPackageForTripSpec(loaded.conversation.tripSpec, decisionPackage, {
    previousDecisionPackage: loaded.conversation.decisionPackage,
    trigger: "recompute_refreshed_live",
    recomputeMode: "refresh_live"
  });
  const store = getConversationStore();
  await store.updateConversation(loaded.conversation.id, { decisionPackage: workflowDecision });
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage: workflowDecision
  };
}

export async function bootstrapTripSplitwise(tripId: string): Promise<TripRecord | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const decisionPackageBase =
    loaded.conversation.decisionPackage ??
    (await enrichDecisionPackageWithLLMReview(
      loaded.conversation.tripSpec,
      await buildDecisionPackage(loaded.conversation.tripSpec)
    ));
  const decisionPackage = finalizeDecisionPackageForTripSpec(loaded.conversation.tripSpec, decisionPackageBase, {
    previousDecisionPackage: loaded.conversation.decisionPackage,
    trigger: "workflow_refresh"
  });
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
  const workflowDecision = finalizeDecisionPackageForTripSpec(loaded.conversation.tripSpec, decisionPackage, {
    previousDecisionPackage: loaded.conversation.decisionPackage ?? decisionPackageBase,
    trigger: "workflow_refresh"
  });

  const store = getConversationStore();
  await store.updateConversation(loaded.conversation.id, { decisionPackage: workflowDecision });
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage: workflowDecision
  };
}

export async function bootstrapTripChat(tripId: string): Promise<TripRecord | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const decisionPackageBase =
    loaded.conversation.decisionPackage ??
    (await enrichDecisionPackageWithLLMReview(
      loaded.conversation.tripSpec,
      await buildDecisionPackage(loaded.conversation.tripSpec)
    ));
  const decisionPackage = finalizeDecisionPackageForTripSpec(loaded.conversation.tripSpec, decisionPackageBase, {
    previousDecisionPackage: loaded.conversation.decisionPackage,
    trigger: "workflow_refresh"
  });
  const result = await bootstrapConversation({
    tripName: `Apres ${decisionPackage.resortShortlist[0] ?? "Trip"} Group Chat`,
    participants: [{ identity: "organizer" }]
  });

  decisionPackage.opsBoard.chatBootstrap = {
    enabled: true,
    provider: "twilio",
    inviteUrl: result.inviteUrl
  };
  const workflowDecision = finalizeDecisionPackageForTripSpec(loaded.conversation.tripSpec, decisionPackage, {
    previousDecisionPackage: loaded.conversation.decisionPackage ?? decisionPackageBase,
    trigger: "workflow_refresh"
  });

  const store = getConversationStore();
  await store.updateConversation(loaded.conversation.id, { decisionPackage: workflowDecision });
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage: workflowDecision
  };
}
