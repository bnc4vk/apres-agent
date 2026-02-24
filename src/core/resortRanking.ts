import { scoreResortForTrip } from "./snow";
import { findResortByName, RESORTS, Resort } from "./resorts";
import { TripSpec } from "./tripSpec";

export function shortlistResorts(spec: TripSpec, limit = 3): Resort[] {
  if (spec.locks.lockedResortName) {
    const locked = findResortByName(spec.locks.lockedResortName);
    return locked ? [locked] : [];
  }

  if (spec.location.resort) {
    const match = findResortByName(spec.location.resort);
    return match ? [match] : [];
  }

  let candidates = RESORTS;
  const hasExplicitLocationFilter = Boolean(spec.location.region || spec.location.state);

  if (spec.location.region) {
    const regionLower = spec.location.region.toLowerCase();
    candidates = candidates.filter((resort) => resort.region.toLowerCase().includes(regionLower));
  }

  if (spec.location.state) {
    const stateLower = spec.location.state.toLowerCase();
    candidates = candidates.filter((resort) => resort.state.toLowerCase().includes(stateLower));
  }

  if (candidates.length === 0 && hasExplicitLocationFilter) {
    return [];
  }

  if (!hasExplicitLocationFilter && (spec.location.openToSuggestions || candidates.length === 0)) {
    candidates = RESORTS;
  }

  const scored = candidates.map((resort) => ({
    resort,
    score: scoreResortCandidate(spec, resort)
  }));

  return scored
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, limit)
    .map((entry) => entry.resort);
}

function scoreResortCandidate(spec: TripSpec, resort: Resort) {
  const snow = scoreResortForTrip(spec, resort);
  const passFit = scorePassFit(spec, resort);
  const travelFit = scoreTravelFit(spec, resort);
  const budgetFit = scoreBudgetFit(spec, resort);

  const weighted =
    snow.score * 0.46 +
    passFit * 0.28 +
    travelFit * 0.14 +
    budgetFit * 0.12;

  return {
    ...snow,
    score: Number(Math.max(0, Math.min(1, weighted)).toFixed(3))
  };
}

function scorePassFit(spec: TripSpec, resort: Resort): number {
  const passes = spec.notes.passes;
  const groupSize = spec.group.size ?? 0;
  if (!passes || groupSize <= 0) return 0.5;

  const holders =
    (resort.passPrograms.includes("ikon") ? passes.ikonCount ?? 0 : 0) +
    (resort.passPrograms.includes("epic") ? passes.epicCount ?? 0 : 0) +
    (resort.passPrograms.includes("indy") ? passes.indyCount ?? 0 : 0) +
    (resort.passPrograms.includes("mountain_collective") ? passes.mountainCollectiveCount ?? 0 : 0);
  const noPassCount = passes.noPassCount ?? Math.max(0, groupSize - holders);

  if (holders <= 0 && noPassCount >= groupSize) return 0.45;
  const coverage = holders / groupSize;

  const penaltyForWastedPasses =
    hasAnyPassHolders(passes) && holders === 0 ? 0.25 : 0;
  return clamp(0.25 + coverage * 0.75 - penaltyForWastedPasses);
}

function scoreTravelFit(spec: TripSpec, resort: Resort): number {
  if (spec.travel.noFlying) {
    const maxDrive = spec.travel.maxDriveHours;
    if (typeof maxDrive !== "number") return 0.55;
    const driveHours = estimateDriveHours(resort);
    return clamp(1 - Math.max(0, driveHours - maxDrive) / 8);
  }

  if (spec.travel.arrivalAirport) {
    return resort.nearestAirport === spec.travel.arrivalAirport ? 1 : 0.62;
  }

  const airportPenalty = resort.nearestAirport === "DEN" || resort.nearestAirport === "SLC" ? 0 : 0.12;
  return clamp(0.78 - airportPenalty);
}

function scoreBudgetFit(spec: TripSpec, resort: Resort): number {
  const band = spec.budget.band ?? "mid";
  const index = resortCostIndex(resort);
  const targetIndex =
    band === "low" ? 0.88 :
    band === "high" ? 1.18 :
    1;
  const distance = Math.abs(index - targetIndex);
  return clamp(1 - distance / 0.45);
}

function hasAnyPassHolders(passes: NonNullable<TripSpec["notes"]["passes"]>): boolean {
  return (
    (passes.ikonCount ?? 0) +
      (passes.epicCount ?? 0) +
      (passes.indyCount ?? 0) +
      (passes.mountainCollectiveCount ?? 0) >
    0
  );
}

function resortCostIndex(resort: Resort): number {
  const table: Record<string, number> = {
    vail: 1.32,
    breckenridge: 1.14,
    "keystone": 0.98,
    "copper-mountain": 1.02,
    "winter-park": 0.97,
    "steamboat": 1.12,
    "deer-valley": 1.38,
    "park-city": 1.18,
    "snowbird": 1.08,
    "palisades": 1.22,
    "northstar": 1.16,
    "heavenly": 1.05
  };
  return table[resort.id] ?? 1;
}

function estimateDriveHours(resort: Resort): number {
  const table: Record<string, number> = {
    "keystone": 2.1,
    "breckenridge": 2.3,
    "copper-mountain": 2.0,
    "winter-park": 2.2,
    "vail": 2.8,
    "steamboat": 3.8,
    "park-city": 0.8,
    "deer-valley": 0.9,
    "snowbird": 0.7,
    "heavenly": 1.2,
    "northstar": 1.0,
    "palisades": 1.1
  };
  return table[resort.id] ?? 3;
}

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}
