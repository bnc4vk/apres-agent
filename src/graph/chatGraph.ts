import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { buildDecisionPackage, DecisionPackage } from "../core/decision";
import { TripSpec, TripSpecPatch, mergeTripSpec, updateTripSpecStatus } from "../core/tripSpec";
import { LLMClient } from "../llm/client";
import { ChatMessage } from "../llm/types";
import { resolveDatesPatch } from "../tools/dateResolution";
import { buildCarRentalNote } from "../core/carRental";

type GraphState = {
  tripSpec: TripSpec;
  messages: ChatMessage[];
  userMessage: string;
  pendingPatch: TripSpecPatch | null;
  assistantMessage: string | null;
  decisionPackage: DecisionPackage | null;
  issueMessage: string | null;
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
    .addNode("append_user", async (state: GraphState) => {
      return {
        messages: [{ role: "user", content: state.userMessage }],
        assistantMessage: null,
        decisionPackage: null
      };
    })
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
      const tripSpec = autoConfirm(mergeTripSpec(state.tripSpec, patch));
      return { tripSpec };
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
      if (missing.length > 0) {
        return {};
      }
      const decisionPackage = await buildDecisionPackage(state.tripSpec);
      return { decisionPackage };
    })
    .addNode("followup", async (state: GraphState) => {
      const missingFields = state.tripSpec.status.missingFields;
      const assistantMessage = defaultQuestion(missingFields);
      return {
        messages: [{ role: "assistant", content: assistantMessage }],
        assistantMessage
      };
    })
    .addNode("finalize", async (state: GraphState) => {
      if (!state.decisionPackage) return {};
      const assistantMessage = buildDecisionSummary(state.tripSpec, state.decisionPackage);
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
    .addConditionalEdges("issue_check", (state: GraphState) => {
      return state.issueMessage ? END : "route";
    })
    .addConditionalEdges("route", (state: GraphState) => {
      const missing = state.tripSpec.status.missingFields;
      return missing.length > 0 ? "followup" : "finalize";
    })
    .addEdge("followup", END)
    .addEdge("finalize", END);

  return graph.compile();
}

const compiledByClient = new WeakMap<LLMClient, ReturnType<typeof buildChatGraph>>();

export async function runChatGraph(
  llm: LLMClient,
  input: RunChatGraphInput
): Promise<RunChatGraphOutput> {
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
    issueMessage: null
  });

  const assistantMessage = result.assistantMessage ?? "Sorry — I couldn’t generate a response.";
  return {
    tripSpec: result.tripSpec,
    messages: result.messages,
    assistantMessage,
    decisionPackage: result.decisionPackage
  };
}

function detectIssue(spec: TripSpec): string | null {
  if (spec.dates.start && spec.dates.end && spec.dates.start > spec.dates.end) {
    return "I noticed the end date is before the start date. Could you confirm the correct date range?";
  }
  if (spec.travel.noFlying === true && spec.travel.arrivalAirport) {
    return `You mentioned no flying but also arriving via ${spec.travel.arrivalAirport}. Should I assume flying is okay?`;
  }
  return null;
}

function autoConfirm(spec: TripSpec): TripSpec {
  const updated = { ...spec };

  const gearProvided =
    updated.gear.rentalRequired !== undefined ||
    typeof updated.gear.rentalCount === "number" ||
    typeof updated.gear.rentalShare === "number" ||
    Boolean(updated.gear.rentalNotes);
  if (typeof updated.gear.rentalCount === "number" && updated.gear.rentalRequired === undefined) {
    updated.gear = { ...updated.gear, rentalRequired: updated.gear.rentalCount > 0 };
  }
  if (gearProvided && updated.gear.confirmed !== true) {
    updated.gear = { ...updated.gear, confirmed: true };
  }

  if (
    (updated.budget.band || updated.budget.perPersonMax || updated.budget.totalMax) &&
    updated.budget.confirmed !== true
  ) {
    updated.budget = { ...updated.budget, confirmed: true };
  }

  const locationProvided =
    Boolean(updated.location.resort || updated.location.region || updated.location.state || updated.location.openToSuggestions);
  if (locationProvided && updated.location.confirmed !== true) {
    updated.location = { ...updated.location, confirmed: true };
  }

  const travelProvided =
    typeof updated.travel.noFlying === "boolean" ||
    typeof updated.travel.maxDriveHours === "number" ||
    Boolean(updated.travel.restrictions?.length) ||
    Boolean(updated.travel.arrivalAirport) ||
    typeof updated.travel.canFlyCount === "number" ||
    typeof updated.travel.cannotFlyCount === "number";

  if (travelProvided && updated.travel.confirmed !== true) {
    updated.travel = { ...updated.travel, confirmed: true };
  }

  return updateTripSpecStatus(updated);
}

function defaultQuestion(missingFields: string[]): string {
  const field = missingFields[0];
  switch (field) {
    case "traveler_pods":
      return "Please share departure locations and headcount for each group (e.g., \"3 from SF, 3 from Sacramento\").";
    case "dates":
      return "What dates are you aiming for? A range like “Feb 20–23” works.";
    case "group_size":
      return "How many people are in the group?";
    case "skill_levels":
      return "What’s the skill level range (beginner/intermediate/advanced/expert)?";
    case "gear_rental":
      return "Do you need gear rentals for anyone in the group?";
    case "budget":
      return "What budget band should I plan for (low / mid / high)?";
    case "travel_restrictions":
      return "Any travel restrictions (no flying, max drive hours, avoid passes)?";
    case "location_input":
      return "Do you have a specific resort, a region/state, or should I suggest options?";
    default:
      return "Tell me a bit more about the trip.";
  }
}


function buildDecisionSummary(spec: TripSpec, decision: DecisionPackage): string {
  const dates = spec.dates.start && spec.dates.end ? `${spec.dates.start} to ${spec.dates.end}` : "TBD";
  const group = spec.group.size ? `${spec.group.size} people` : "your group";
  const resortLine =
    decision.resortShortlist.length > 0
      ? `Top resort matches: ${decision.resortShortlist.join(", ")}.`
      : "No resort matches found in the current dataset.";
  const itineraryLines = decision.itineraries
    .map((itinerary) => {
      const budget = itinerary.lodgingBudgetPerPerson
        ? `Lodging target: ~$${itinerary.lodgingBudgetPerPerson} pp.`
        : "Lodging budget: flexible.";
      return `- ${itinerary.title}: ${itinerary.summary} ${budget}`;
    })
    .join("\n");
  const poiLine = buildPoiSummary(decision);
  const exportLine = "Use the “Export to Google Sheets” button when you’re ready for a shareable plan.";
  const rentalLine = buildCarRentalNote(spec);
  const first = decision.itineraries[0];
  const linkLine = first
    ? `Planning links: Lodging ${first.researchLinks.lodgingSearch} | Gear ${first.researchLinks.gearSearch} | Grocery ${first.researchLinks.grocerySearch} | Takeout ${first.researchLinks.takeoutSearch}`
    : null;
  const extras = [poiLine, rentalLine, linkLine, exportLine].filter(Boolean).join("\n");
  return `I’ve got enough to build itineraries for ${group} on ${dates}.\n${resortLine}\n\nHere are 2–3 options:\n${itineraryLines}\n\n${extras}`;
}

function buildPoiSummary(decision: DecisionPackage): string {
  const gear = decision.poiResults.gearShops[0];
  const grocery = decision.poiResults.groceries[0];
  const restaurant = decision.poiResults.restaurants[0];
  return `Nearby picks: Gear — ${gear.name} (${gear.hours}); Grocery — ${grocery.name}; Restaurant — ${restaurant.name}.`;
}
