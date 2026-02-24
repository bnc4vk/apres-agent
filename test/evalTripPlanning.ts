import { createSession } from "../src/conversations/engine";
import { runChatGraph } from "../src/graph/chatGraph";
import { createLLMClientForProfile } from "../src/llm/factory";
import { LLMProfile } from "../src/llm/config";
import { buildDecisionPackage } from "../src/core/decision";
import { enrichDecisionPackageWithLLMReview } from "../src/services/decisionReviewService";
import { findResortByName } from "../src/core/resorts";

type EvalScenario = {
  id: string;
  messages: string[];
  expectedState?: string;
  description: string;
};

const SCENARIOS: EvalScenario[] = [
  {
    id: "co_epic_mixed",
    description: "Colorado March trip with half Epic coverage and mixed abilities",
    expectedState: "Colorado",
    messages: [
      "I'm planning a ski trip in Colorado for 6 people sometime in March. Half are advanced and half are beginners.",
      "Budget is $1500 per person. Beginners need rentals. Half the group has Epic passes. No travel restrictions.",
      "Weekend trip is fine. Proceed with assumptions if needed."
    ]
  },
  {
    id: "utah_ikon_group",
    description: "Utah group trip with Ikon holders and dining constraints",
    expectedState: "Utah",
    messages: [
      "Trip for 8 in Utah in late March. Mostly intermediate, a few advanced. We have 5 Ikon pass holders.",
      "Target budget around $1800 pp. Need lodging with kitchen and hot tub. Flying is fine into SLC.",
      "Need restaurants that can handle a group and takeout options."
    ]
  },
  {
    id: "tahoe_budget_drive",
    description: "Tahoe road trip with lower budget and no passes",
    expectedState: "California",
    messages: [
      "Road trip for 5 from SF to Tahoe next month. Beginners/intermediate mix. No one has passes.",
      "Budget under $1100 per person and rentals for 3 people. We prefer cheaper options and flexible dates.",
      "Proceed with assumptions."
    ]
  }
];

async function main() {
  const profiles = parseProfiles();
  const scenarioIds = parseScenarioIds();
  const scenarios = scenarioIds.length > 0 ? SCENARIOS.filter((scenario) => scenarioIds.includes(scenario.id)) : SCENARIOS;
  const results = [];

  for (const profile of profiles) {
    for (const scenario of scenarios) {
      const row = await runScenario(profile, scenario);
      results.push(row);
      console.log(
        `[${profile}] ${scenario.id}: final=${row.generated ? "yes" : "no"} state_ok=${row.locationCompliance} costs=${row.costDistinctCount} review=${row.reviewSummaryPresent}`
      );
    }
  }

  console.log("\nEval results JSON:");
  console.log(JSON.stringify(results, null, 2));
}

async function runScenario(profile: LLMProfile, scenario: EvalScenario) {
  const llm = createLLMClientForProfile(profile);
  const session = createSession();
  let tripSpec = session.tripSpec;
  let messages = session.history.map((turn) => ({ role: turn.role, content: turn.content }));
  let decisionPackage = null as Awaited<ReturnType<typeof buildDecisionPackage>> | null;
  let error: string | null = null;

  try {
    for (const userMessage of scenario.messages) {
      const result = await runChatGraph(llm, { tripSpec, messages, userMessage });
      tripSpec = result.tripSpec;
      messages = result.messages;
      decisionPackage = result.decisionPackage;
    }
  } catch (e: any) {
    error = String(e?.message ?? e);
  }

  let deterministic = null as Awaited<ReturnType<typeof buildDecisionPackage>> | null;
  let reviewed = null as Awaited<ReturnType<typeof enrichDecisionPackageWithLLMReview>> | null;
  if (!error) {
    try {
      deterministic = await buildDecisionPackage(tripSpec);
      reviewed = await enrichDecisionPackageWithLLMReview(tripSpec, deterministic, llm, { force: true });
    } catch (e: any) {
      error = String(e?.message ?? e);
    }
  }

  const candidates = deterministic?.itineraries ?? [];
  const reviewedCandidates = reviewed?.itineraries ?? [];
  const resorts = candidates.map((c) => c.resortName);
  const reviewedResorts = reviewedCandidates.map((c) => c.resortName);
  const matrix = deterministic?.decisionMatrix ?? [];
  const distinctCosts = new Set(matrix.map((row) => row.totalCostPerPerson).filter((v) => typeof v === "number"));
  const stateOk = scenario.expectedState
    ? resorts.every((name) => (findResortByName(name)?.state ?? "") === scenario.expectedState)
    : true;

  return {
    profile,
    scenarioId: scenario.id,
    description: scenario.description,
    generated: Boolean(deterministic && candidates.length > 0),
    error,
    tripSpecSnapshot: {
      location: tripSpec.location,
      group: tripSpec.group,
      budget: tripSpec.budget,
      passes: tripSpec.notes.passes,
      travel: tripSpec.travel
    },
    locationCompliance: stateOk,
    deterministicResorts: resorts,
    reviewedResorts,
    reviewReordered:
      reviewedResorts.length > 0 && resorts.join("|") !== reviewedResorts.join("|"),
    costDistinctCount: distinctCosts.size,
    topDeterministic: matrix[0]
      ? {
          resort: matrix[0].resortName,
          overallScore: matrix[0].overallScore,
          passFitScore: matrix[0].passFitScore,
          totalCostPerPerson: matrix[0].totalCostPerPerson
        }
      : null,
    topReviewed: reviewedCandidates[0]
      ? {
          resort: reviewedCandidates[0].resortName,
          aiReview: reviewedCandidates[0].aiReview ?? null
        }
      : null,
    reviewSummaryPresent: Boolean(reviewed?.aiReview?.summary),
    reviewMethodologyPresent: Boolean(reviewed?.aiReview?.methodology),
    allReviewedCandidatesHaveRationale:
      reviewedCandidates.length > 0 &&
      reviewedCandidates.every((candidate) => Boolean(candidate.aiReview?.rationale)),
    linkCompleteness:
      candidates.length > 0 &&
      candidates.every((candidate) => {
        const links = candidate.researchLinks;
        return Boolean(
          links?.lodgingSearch &&
            links?.airbnbSearch &&
            links?.vrboSearch &&
            links?.gearSearch &&
            links?.grocerySearch &&
            links?.takeoutSearch
        );
      })
  };
}

function parseProfiles(): LLMProfile[] {
  const raw = process.env.EVAL_LLM_PROFILES ?? process.env.LLM_PROFILE ?? "mistral_free";
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean) as LLMProfile[];
  return values.length > 0 ? values : ["mistral_free"];
}

function parseScenarioIds(): string[] {
  return (process.env.EVAL_SCENARIO_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

main().catch((error) => {
  console.error("Trip planning eval failed.");
  console.error(error);
  process.exit(1);
});
