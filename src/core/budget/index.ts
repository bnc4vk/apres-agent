import { TripSpec } from "../tripSpec";
import { buildSummaryLine, estimateItineraryBudget } from "./estimators";
import { BudgetGraphInputItinerary, BudgetGraphResult, BudgetSummary, ItineraryBudgetEstimate } from "./types";

export async function runBudgetGraph(
  spec: TripSpec,
  itineraries: BudgetGraphInputItinerary[]
): Promise<BudgetGraphResult> {
  const byId: Record<string, ItineraryBudgetEstimate> = {};

  const estimates = await Promise.all(
    itineraries.map(async (itinerary) => {
      const estimate = await estimateItineraryBudget(spec, itinerary);
      byId[itinerary.id] = estimate;
      return estimate;
    })
  );

  const sorted = estimates.slice().sort((a, b) => a.perPersonTotal - b.perPersonTotal);
  const best = sorted[0] ?? null;

  const summary: BudgetSummary = best
    ? {
        bestItineraryId: best.itineraryId,
        bestResortName: best.resortName,
        bestPerPersonTotal: best.perPersonTotal,
        bestGroupTotal: best.groupTotal,
        feasible: best.feasible,
        targetPerPerson: best.targetPerPerson,
        shortfallPerPerson: best.shortfallPerPerson,
        summaryLine: buildSummaryLine(best),
        assumptions: best.assumptions
      }
    : {
        bestItineraryId: null,
        bestResortName: null,
        bestPerPersonTotal: 0,
        bestGroupTotal: 0,
        feasible: true,
        targetPerPerson: null,
        shortfallPerPerson: 0,
        summaryLine: "Budget check unavailable for this trip yet.",
        assumptions: ["No itinerary candidates were available for budget analysis."]
      };

  return { itineraryBudgets: byId, summary };
}

export type {
  BudgetComponentEstimate,
  BudgetComponentKey,
  BudgetGraphInputItinerary,
  BudgetGraphResult,
  BudgetSummary,
  ItineraryBudgetEstimate
} from "./types";
