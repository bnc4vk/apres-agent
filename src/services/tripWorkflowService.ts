import { getConversationStore } from "../adapters/persistence";
import { loadConversationByTripId } from "../conversations/sessionService";
import { buildDecisionPackage, DecisionPackage } from "../core/decision";
import {
  applyWorkflowActions,
  attachWorkflowState,
  buildWorkflowSnapshotReport,
  runWorkflowLinkHealthValidation,
  type WorkflowAction
} from "../core/tripWorkflow";
import { mergeTripSpec, TripSpec, TripSpecPatch } from "../core/tripSpec";
import { enrichDecisionPackageWithLLMReview } from "./decisionReviewService";

type RecomputeMode = "same_snapshot" | "refresh_live";

export type WorkflowTripResult = {
  tripId: string;
  sessionId: string;
  tripSpec: TripSpec;
  decisionPackage: DecisionPackage;
  googleLinked: boolean;
  sheetUrl: string | null;
};

export function finalizeDecisionPackageForTripSpec(
  tripSpec: Parameters<typeof attachWorkflowState>[0],
  nextDecision: DecisionPackage,
  options?: Parameters<typeof attachWorkflowState>[2]
): DecisionPackage {
  return attachWorkflowState(tripSpec, nextDecision, options);
}

export async function recomputeTripDecisionPackage(
  tripId: string,
  mode: RecomputeMode = "refresh_live"
): Promise<WorkflowTripResult | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const previousDecision = loaded.conversation.decisionPackage;
  if (!previousDecision && mode === "same_snapshot") {
    const built = await enrichDecisionPackageWithLLMReview(loaded.conversation.tripSpec, await buildDecisionPackage(loaded.conversation.tripSpec));
    const decisionPackage = attachWorkflowState(loaded.conversation.tripSpec, built, {
      previousDecisionPackage: previousDecision,
      trigger: "recompute_refreshed_live",
      recomputeMode: "refresh_live"
    });
    await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
    return mapWorkflowTripResult(loaded, decisionPackage);
  }

  const decisionPackage =
    mode === "same_snapshot" && previousDecision
      ? attachWorkflowState(loaded.conversation.tripSpec, previousDecision, {
          previousDecisionPackage: previousDecision,
          trigger: "recompute_same_snapshot",
          recomputeMode: "same_snapshot"
        })
      : attachWorkflowState(
          loaded.conversation.tripSpec,
          await enrichDecisionPackageWithLLMReview(loaded.conversation.tripSpec, await buildDecisionPackage(loaded.conversation.tripSpec)),
          {
            previousDecisionPackage: previousDecision,
            trigger: "recompute_refreshed_live",
            recomputeMode: "refresh_live"
          }
        );

  await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
  return mapWorkflowTripResult(loaded, decisionPackage);
}

export async function applyTripWorkflowActions(
  tripId: string,
  actions: WorkflowAction[]
): Promise<WorkflowTripResult | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const base =
    loaded.conversation.decisionPackage ??
    attachWorkflowState(
      loaded.conversation.tripSpec,
      await enrichDecisionPackageWithLLMReview(loaded.conversation.tripSpec, await buildDecisionPackage(loaded.conversation.tripSpec)),
      { trigger: "workflow_refresh" }
    );
  const decisionPackage = applyWorkflowActions(loaded.conversation.tripSpec, base, actions);
  await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
  return mapWorkflowTripResult(loaded, decisionPackage);
}

export async function exportTripWorkflowSnapshot(
  tripId: string
): Promise<{ trip: WorkflowTripResult; report: { json: Record<string, unknown>; markdown: string } } | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const decisionPackage =
    loaded.conversation.decisionPackage ??
    attachWorkflowState(
      loaded.conversation.tripSpec,
      await enrichDecisionPackageWithLLMReview(loaded.conversation.tripSpec, await buildDecisionPackage(loaded.conversation.tripSpec)),
      { trigger: "workflow_refresh" }
    );
  const report = buildWorkflowSnapshotReport(loaded.conversation.tripSpec, decisionPackage);
  await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
  return { trip: mapWorkflowTripResult(loaded, decisionPackage), report };
}

export async function validateTripWorkflowLinks(tripId: string): Promise<WorkflowTripResult | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  if (!loaded.conversation.decisionPackage) return null;
  const checked = await runWorkflowLinkHealthValidation(loaded.conversation.decisionPackage);
  const decisionPackage = attachWorkflowState(loaded.conversation.tripSpec, checked, {
    previousDecisionPackage: loaded.conversation.decisionPackage,
    trigger: "workflow_refresh"
  });
  await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
  return mapWorkflowTripResult(loaded, decisionPackage);
}

export async function refreshTripOperationalWorkflow(tripId: string): Promise<WorkflowTripResult | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  if (!loaded.conversation.decisionPackage) return null;
  const decisionPackage = attachWorkflowState(loaded.conversation.tripSpec, loaded.conversation.decisionPackage, {
    previousDecisionPackage: loaded.conversation.decisionPackage,
    trigger: "workflow_refresh"
  });
  await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
  return mapWorkflowTripResult(loaded, decisionPackage);
}

export async function applyTripTemplatePatch(
  tripId: string,
  patch: TripSpecPatch
): Promise<WorkflowTripResult | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  const tripSpec = mergeTripSpec(loaded.conversation.tripSpec, patch);
  let decisionPackage: DecisionPackage | null = loaded.conversation.decisionPackage;
  if (decisionPackage) {
    decisionPackage = attachWorkflowState(tripSpec, decisionPackage, {
      previousDecisionPackage: decisionPackage,
      trigger: "workflow_refresh"
    });
  }
  if (!decisionPackage) {
    decisionPackage = attachWorkflowState(
      tripSpec,
      await enrichDecisionPackageWithLLMReview(tripSpec, await buildDecisionPackage(tripSpec)),
      {
        previousDecisionPackage: loaded.conversation.decisionPackage,
        trigger: "workflow_refresh"
      }
    );
  }
  await getConversationStore().updateConversation(loaded.conversation.id, { tripSpec, decisionPackage });
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec,
    decisionPackage,
    googleLinked: loaded.googleLinked,
    sheetUrl: loaded.conversation.sheetUrl ?? null
  };
}

function mapWorkflowTripResult(
  loaded: NonNullable<Awaited<ReturnType<typeof loadConversationByTripId>>>,
  decisionPackage: DecisionPackage
): WorkflowTripResult {
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage,
    googleLinked: loaded.googleLinked,
    sheetUrl: loaded.conversation.sheetUrl ?? null
  };
}
