import { fetchNearbyPOIs, POIResults } from "./poi";
import { buildItineraries, ItineraryPlan } from "./itinerary";
import { TripSpec } from "./tripSpec";

export type DecisionPackage = ItineraryPlan & {
  poiResults: POIResults;
};

export async function buildDecisionPackage(spec: TripSpec): Promise<DecisionPackage> {
  const plan = buildItineraries(spec);
  const locationHint = plan.itineraries[0]?.resortName ?? "resort";
  const poiResults = await fetchNearbyPOIs(locationHint);
  return { ...plan, poiResults };
}
