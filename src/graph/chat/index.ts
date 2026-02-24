import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { buildDecisionPackage, DecisionPackage } from "../../core/decision";
import { TripSpec, mergeTripSpec } from "../../core/tripSpec";
import { LLMClient } from "../../llm/client";
import { ChatMessage } from "../../llm/types";
import { SpecExtractionResult } from "../../llm/client";
import {
  buildAssumptionOffer,
  buildAssumptionPatch,
  createPendingAssumptions,
  buildGenerationNote,
  syncPendingAssumptions,
  shouldForceGenerate,
  shouldOfferAssumptionMode
} from "./assumptions";
import { buildDecisionSummary } from "./messaging";
import { autoConfirm, detectIssue } from "./spec";
import {
  applyExtractionResult,
  buildGeneralizedFollowup,
  filterActionableUnresolvedPaths,
  filterUnresolvedForMissingFields
} from "../../core/specExtraction";

type GraphState = {
  tripSpec: TripSpec;
  messages: ChatMessage[];
  userMessage: string;
  assistantMessage: string | null;
  decisionPackage: DecisionPackage | null;
  issueMessage: string | null;
  generationNote: string | null;
  extractionResult: SpecExtractionResult | null;
  unresolvedPaths: string[];
  clarifyingQuestions: string[];
};

const GraphStateDef = Annotation.Root({
  tripSpec: Annotation<TripSpec>({
    reducer: (_prev, next) => next,
    default: undefined as any
  }),
  messages: Annotation<ChatMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  }),
  userMessage: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => ""
  }),
  assistantMessage: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  decisionPackage: Annotation<DecisionPackage | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  issueMessage: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  generationNote: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  extractionResult: Annotation<SpecExtractionResult | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  unresolvedPaths: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => []
  }),
  clarifyingQuestions: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => []
  })
});

export type RunChatGraphInput = {
  tripSpec: TripSpec;
  messages: ChatMessage[];
  userMessage: string;
};

export type RunChatGraphOutput = {
  tripSpec: TripSpec;
  messages: ChatMessage[];
  assistantMessage: string;
  decisionPackage: DecisionPackage | null;
};

export function buildChatGraph(llm: LLMClient) {
  const graph = new StateGraph(GraphStateDef)
    .addNode("append_user", async (state: GraphState) => ({
      messages: [{ role: "user", content: state.userMessage }],
      assistantMessage: null,
      decisionPackage: null,
      generationNote: null,
      extractionResult: null,
      clarifyingQuestions: []
    }))
    .addNode("extract", async (state: GraphState) => {
      const extractionResult = await llm.extractTripSpec({
        tripSpec: state.tripSpec,
        messages: state.messages,
        lastUserMessage: state.userMessage
      });
      return { extractionResult };
    })
    .addNode("apply_extraction", async (state: GraphState) => {
      const extractionResult = state.extractionResult;
      if (!extractionResult) return {};
      const applied = applyExtractionResult(state.tripSpec, extractionResult);
      const tripSpec = autoConfirm(applied.tripSpec);
      return {
        tripSpec,
        unresolvedPaths: applied.unresolvedPaths,
        clarifyingQuestions: applied.clarifyingQuestions
      };
    })
    .addNode("issue_check", async (state: GraphState) => {
      const issue = detectIssue(state.tripSpec);
      if (!issue) return {};
      return {
        issueMessage: issue,
        messages: [{ role: "assistant", content: issue }],
        assistantMessage: issue
      };
    })
    .addNode("route", async (state: GraphState) => {
      let tripSpec = state.tripSpec;
      let pending = syncPendingAssumptions(
        tripSpec.extraction.pendingAssumptions,
        tripSpec.status.missingFields
      );

      if (pending.length > 0) {
        const resolution = await llm.resolveAssumptions({
          tripSpec,
          messages: state.messages,
          lastUserMessage: state.userMessage,
          pendingAssumptions: pending
        });

        const acceptedIds = new Set(resolution.acceptedIds ?? []);
        const rejectedIds = new Set(resolution.rejectedIds ?? []);
        const acceptedFields = pending
          .filter((item) => acceptedIds.has(item.id))
          .map((item) => item.field);

        if (acceptedFields.length > 0) {
          const patch = buildAssumptionPatch(tripSpec, acceptedFields);
          tripSpec = autoConfirm(mergeTripSpec(tripSpec, patch));
        }

        pending = pending.filter((item) => !acceptedIds.has(item.id) && !rejectedIds.has(item.id));
        pending = syncPendingAssumptions(pending, tripSpec.status.missingFields);
      }

      if (!samePendingAssumptions(tripSpec.extraction.pendingAssumptions, pending)) {
        tripSpec = mergeTripSpec(tripSpec, {
          extraction: { pendingAssumptions: pending }
        });
      }

      const missing = tripSpec.status.missingFields;
      const unresolved = filterUnresolvedForMissingFields(
        filterActionableUnresolvedPaths(state.unresolvedPaths ?? []),
        missing
      );
      if (missing.length === 0 && unresolved.length === 0) {
        return {
          tripSpec,
          decisionPackage: await buildDecisionPackage(tripSpec)
        };
      }

      const actionableMissing = missing.length > 0 ? missing : unresolved.map((path) => path.split(".")[0] ?? path);
      if (shouldForceGenerate(state.userMessage, actionableMissing)) {
        const patch = buildAssumptionPatch(tripSpec, actionableMissing);
        const assumedSpec = autoConfirm(
          mergeTripSpec(tripSpec, {
            ...patch,
            extraction: { pendingAssumptions: [] }
          })
        );
        return {
          tripSpec: assumedSpec,
          decisionPackage: await buildDecisionPackage(assumedSpec),
          generationNote: buildGenerationNote(actionableMissing)
        };
      }

      if (shouldOfferAssumptionMode(state.messages, actionableMissing)) {
        const nextPending = createPendingAssumptions(actionableMissing, pending);
        const assistantMessage = buildAssumptionOffer(nextPending);
        return {
          tripSpec: mergeTripSpec(tripSpec, {
            extraction: { pendingAssumptions: nextPending }
          }),
          messages: [{ role: "assistant", content: assistantMessage }],
          assistantMessage
        };
      }

      return { tripSpec };
    })
    .addNode("followup", async (state: GraphState) => {
      const assistantMessage = buildGeneralizedFollowup(
        filterActionableUnresolvedPaths(state.unresolvedPaths),
        state.tripSpec.status.missingFields,
        state.clarifyingQuestions
      );
      return {
        messages: [{ role: "assistant", content: assistantMessage }],
        assistantMessage
      };
    })
    .addNode("finalize", async (state: GraphState) => {
      if (!state.decisionPackage) return {};
      const assistantMessage = buildDecisionSummary(
        state.tripSpec,
        state.decisionPackage,
        state.generationNote
      );
      return {
        messages: [{ role: "assistant", content: assistantMessage }],
        assistantMessage
      };
    })
    .addEdge(START, "append_user")
    .addEdge("append_user", "extract")
    .addEdge("extract", "apply_extraction")
    .addEdge("apply_extraction", "issue_check")
    .addConditionalEdges("issue_check", (state: GraphState) => (state.issueMessage ? END : "route"))
    .addConditionalEdges("route", (state: GraphState) => {
      if (state.decisionPackage) return "finalize";
      if (state.assistantMessage) return END;
      return "followup";
    })
    .addEdge("followup", END)
    .addEdge("finalize", END);

  return graph.compile();
}

function samePendingAssumptions(a: TripSpec["extraction"]["pendingAssumptions"], b: TripSpec["extraction"]["pendingAssumptions"]): boolean {
  if (a.length !== b.length) return false;
  const aKeys = [...a].map((item) => `${item.id}:${item.field}`).sort();
  const bKeys = [...b].map((item) => `${item.id}:${item.field}`).sort();
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  return true;
}

const compiledByClient = new WeakMap<LLMClient, ReturnType<typeof buildChatGraph>>();

export async function runChatGraph(llm: LLMClient, input: RunChatGraphInput): Promise<RunChatGraphOutput> {
  const existing = compiledByClient.get(llm);
  const app = existing ?? buildChatGraph(llm);
  if (!existing) compiledByClient.set(llm, app);

  const result = await app.invoke({
    tripSpec: input.tripSpec,
    messages: input.messages,
    userMessage: input.userMessage,
    assistantMessage: null,
    decisionPackage: null,
    issueMessage: null,
    generationNote: null,
    extractionResult: null,
    unresolvedPaths: [],
    clarifyingQuestions: []
  });

  return {
    tripSpec: result.tripSpec,
    messages: result.messages,
    assistantMessage: result.assistantMessage ?? "Sorry — I couldn’t generate a response.",
    decisionPackage: result.decisionPackage
  };
}
