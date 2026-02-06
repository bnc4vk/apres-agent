import { scoreResortForTrip } from "./snow";
import { findResortByName, RESORTS, Resort } from "./resorts";
import { TripSpec } from "./tripSpec";

export function shortlistResorts(spec: TripSpec, limit = 3): Resort[] {
  if (spec.location.resort) {
    const match = findResortByName(spec.location.resort);
    return match ? [match] : [];
  }

  let candidates = RESORTS;

  if (spec.location.region) {
    const regionLower = spec.location.region.toLowerCase();
    candidates = candidates.filter((resort) => resort.region.toLowerCase().includes(regionLower));
  }

  if (spec.location.state) {
    const stateLower = spec.location.state.toLowerCase();
    candidates = candidates.filter((resort) => resort.state.toLowerCase().includes(stateLower));
  }

  if (spec.location.openToSuggestions || candidates.length === 0) {
    candidates = RESORTS;
  }

  const scored = candidates.map((resort) => ({
    resort,
    score: scoreResortForTrip(spec, resort)
  }));

  return scored
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, limit)
    .map((entry) => entry.resort);
}
