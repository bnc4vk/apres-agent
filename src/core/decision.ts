import { fetchNearbyPOIs, POIResults } from "./poi";
import { buildItineraries, ItineraryPlan } from "./itinerary";
import { TripSpec } from "./tripSpec";
import { runBudgetGraph, BudgetSummary } from "./budgetGraph";
import { buildResearchLinks } from "./researchLinks";

export type DecisionPackage = ItineraryPlan & {
  poiResults: POIResults;
  budgetSummary: BudgetSummary;
};

export async function buildDecisionPackage(spec: TripSpec): Promise<DecisionPackage> {
  const basePlan = buildItineraries(spec);
  const budgetGraph = await runBudgetGraph(spec, basePlan.itineraries);
  const itineraries = basePlan.itineraries.map((itinerary) => {
    const estimate = budgetGraph.itineraryBudgets[itinerary.id];
    if (!estimate) return itinerary;
    return {
      ...itinerary,
      lodgingBudgetPerPerson: estimate.components.find((c) => c.key === "housing")?.perPerson ?? itinerary.lodgingBudgetPerPerson,
      budgetEstimate: {
        perPersonTotal: estimate.perPersonTotal,
        feasible: estimate.feasible,
        shortfallPerPerson: estimate.shortfallPerPerson,
        targetPerPerson: estimate.targetPerPerson,
        components: {
          pass: estimate.components.find((c) => c.key === "pass")?.perPerson ?? 0,
          travel: estimate.components.find((c) => c.key === "travel")?.perPerson ?? 0,
          food: estimate.components.find((c) => c.key === "food")?.perPerson ?? 0,
          gear_rental: estimate.components.find((c) => c.key === "gear_rental")?.perPerson ?? 0,
          housing: estimate.components.find((c) => c.key === "housing")?.perPerson ?? 0
        },
        assumptions: estimate.assumptions
      },
      researchLinks: {
        ...buildResearchLinks(spec, itinerary.resortName, estimate.nightlyLodgingCap)
      }
    };
  });

  const plan: ItineraryPlan = { itineraries, resortShortlist: basePlan.resortShortlist };
  const locationHint = plan.itineraries[0]?.resortName ?? "resort";
  const poiResults = await fetchNearbyPOIs(locationHint);
  return { ...plan, poiResults, budgetSummary: budgetGraph.summary };
}
