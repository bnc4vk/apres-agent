import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { buildDecisionPackage, DecisionPackage } from "../../core/decision";
import { TripSpec, TripSpecPatch, mergeTripSpec } from "../../core/tripSpec";
import { LLMClient } from "../../llm/client";
import { ChatMessage } from "../../llm/types";
import { resolveDatesPatch } from "../../tools/dateResolution";
import {
  buildAssumptionOffer,
  buildAssumptionPatch,
  buildGenerationNote,
  shouldForceGenerate,
  shouldOfferAssumptionMode
} from "./assumptions";
import { buildDecisionSummary, defaultQuestion } from "./messaging";
import { autoConfirm, detectIssue } from "./spec";

type GraphState = {
  tripSpec: TripSpec;
  messages: ChatMessage[];
  userMessage: string;
  pendingPatch: TripSpecPatch | null;
  assistantMessage: string | null;
  decisionPackage: DecisionPackage | null;
  issueMessage: string | null;
  generationNote: string | null;
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
  pendingPatch: Annotation<TripSpecPatch | null>({
    reducer: (_prev, next) => next,
    default: () => null
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
      generationNote: null
    }))
    .addNode("spec_patch", async (state: GraphState) => {
      const patch = await llm.generateTripSpecPatch({
        tripSpec: state.tripSpec,
        messages: state.messages,
        lastUserMessage: state.userMessage
      });
      return { pendingPatch: patch };
    })
    .addNode("merge", async (state: GraphState) => {
      const patch = state.pendingPatch ?? {};
      const tripSpec = autoConfirm(mergeTripSpec(state.tripSpec, patch));
      return { tripSpec, pendingPatch: null };
    })
    .addNode("date_resolution", async (state: GraphState) => {
      const patch = resolveDatesPatch(state.userMessage, state.tripSpec.dates);
      if (!patch) return {};
      return { tripSpec: autoConfirm(mergeTripSpec(state.tripSpec, patch)) };
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
      const missing = state.tripSpec.status.missingFields;
      if (missing.length === 0) {
        return { decisionPackage: await buildDecisionPackage(state.tripSpec) };
      }

      if (shouldForceGenerate(state.userMessage, missing)) {
        const patch = buildAssumptionPatch(state.tripSpec, missing);
        const assumedSpec = autoConfirm(mergeTripSpec(state.tripSpec, patch));
        return {
          tripSpec: assumedSpec,
          decisionPackage: await buildDecisionPackage(assumedSpec),
          generationNote: buildGenerationNote(missing)
        };
      }

      if (shouldOfferAssumptionMode(state.messages, missing)) {
        const assistantMessage = buildAssumptionOffer(missing);
        return {
          messages: [{ role: "assistant", content: assistantMessage }],
          assistantMessage
        };
      }

      return {};
    })
    .addNode("followup", async (state: GraphState) => {
      const assistantMessage = defaultQuestion(state.tripSpec.status.missingFields);
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
    .addEdge("append_user", "spec_patch")
    .addEdge("spec_patch", "merge")
    .addEdge("merge", "date_resolution")
    .addEdge("date_resolution", "issue_check")
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

const compiledByClient = new WeakMap<LLMClient, ReturnType<typeof buildChatGraph>>();

export async function runChatGraph(llm: LLMClient, input: RunChatGraphInput): Promise<RunChatGraphOutput> {
  const existing = compiledByClient.get(llm);
  const app = existing ?? buildChatGraph(llm);
  if (!existing) compiledByClient.set(llm, app);

  const result = await app.invoke({
    tripSpec: input.tripSpec,
    messages: input.messages,
    userMessage: input.userMessage,
    pendingPatch: null,
    assistantMessage: null,
    decisionPackage: null,
    issueMessage: null,
    generationNote: null
  });

  return {
    tripSpec: result.tripSpec,
    messages: result.messages,
    assistantMessage: result.assistantMessage ?? "Sorry — I couldn’t generate a response.",
    decisionPackage: result.decisionPackage
  };
}
