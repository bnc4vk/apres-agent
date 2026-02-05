import { fetchNearbyPOIs, POIResults } from "./poi";
import { createSheetForTrip, SheetResult } from "./sheets";
import { buildItineraries, ItineraryPlan } from "./itinerary";
import { TripSpec } from "./tripSpec";

export type DecisionPackage = ItineraryPlan & {
  poiResults: POIResults;
  sheet: SheetResult;
};

export async function buildDecisionPackage(spec: TripSpec): Promise<DecisionPackage> {
  const plan = buildItineraries(spec);
  const locationHint = plan.itineraries[0]?.resortName ?? "resort";
  const poiResults = await fetchNearbyPOIs(locationHint);
  const sheet = await createSheetForTrip(spec, plan);
  return { ...plan, poiResults, sheet };
}
