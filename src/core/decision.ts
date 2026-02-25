import { fetchNearbyPOIs, POIResults } from "./poi";
import { buildItineraries, ItineraryPlan } from "./itinerary";
import { TripSpec } from "./tripSpec";
import { runBudgetGraph, BudgetSummary } from "./budgetGraph";
import { buildResearchLinks } from "./researchLinks";
import { getCarProvider, getLodgingProvider } from "../adapters/providers";
import { CarOption, LodgingOption } from "./supply";
import { buildOpsBoard, OpsBoard } from "./opsBoard";
import { findResortByName } from "./resorts";
import { scoreResortForTrip } from "./snow";
import type { TripWorkflowState } from "./tripWorkflow";

export type DecisionMatrixRow = {
  itineraryId: string;
  resortName: string;
  totalCostPerPerson: number | null;
  overallScore: number;
  budgetFitScore: number;
  snowSkillScore: number;
  lodgingFitScore: number;
  passFitScore: number;
  travelFitScore: number;
  locked: boolean;
  details: {
    budget: string;
    pass: string;
    snowSkill: string;
    lodging: string;
    travel: string;
    overall: string;
  };
};

export type DecisionPackage = ItineraryPlan & {
  poiResults: POIResults;
  budgetSummary: BudgetSummary;
  decisionMatrix: DecisionMatrixRow[];
  opsBoard: OpsBoard;
  workflow?: TripWorkflowState;
  aiReview?: {
    summary: string;
    methodology: string;
    caveats: string[];
    recommendedOrder: string[];
  };
};

export async function buildDecisionPackage(spec: TripSpec): Promise<DecisionPackage> {
  const basePlan = buildItineraries(spec);
  const budgetGraph = await runBudgetGraph(spec, basePlan.itineraries);
  const itineraries = await Promise.all(
    basePlan.itineraries.map(async (itinerary) => {
      const estimate = budgetGraph.itineraryBudgets[itinerary.id];
      if (!estimate) return itinerary;

      const checkIn = itinerary.dateRange?.start ?? spec.dates.start;
      const checkOut = itinerary.dateRange?.end ?? spec.dates.end;
      let lodgingOptions: LodgingOption[] = [];
      let carOptions: CarOption[] = [];

      if (checkIn && checkOut) {
        lodgingOptions = await getLodgingProvider().search({
          spec,
          resortName: itinerary.resortName,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          nightlyBudgetCapUsd: estimate.nightlyLodgingCap
        });
        if (shouldIncludeCars(spec)) {
          const airport = spec.travel.arrivalAirport || "DEN";
          carOptions = await getCarProvider().search({
            spec,
            airportCode: airport,
            pickupDate: checkIn,
            dropoffDate: checkOut
          });
        }
      }

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
          componentSources: {
            pass: estimate.components.find((c) => c.key === "pass")?.source ?? "estimated",
            travel: estimate.components.find((c) => c.key === "travel")?.source ?? "estimated",
            food: estimate.components.find((c) => c.key === "food")?.source ?? "estimated",
            gear_rental: estimate.components.find((c) => c.key === "gear_rental")?.source ?? "estimated",
            housing: estimate.components.find((c) => c.key === "housing")?.source ?? "estimated"
          },
          assumptions: estimate.assumptions
        },
        researchLinks: {
          ...buildResearchLinks(spec, itinerary.resortName, estimate.nightlyLodgingCap)
        },
        liveOptions: {
          lodging: lodgingOptions,
          cars: carOptions
        },
        warnings:
          spec.lodgingConstraints.constraintMode === "hard" && lodgingOptions.length === 0
            ? [...itinerary.warnings, "No lodging options matched your hard amenity/walkability constraints."]
            : itinerary.warnings
      };
    })
  );

  const plan: ItineraryPlan = { itineraries, resortShortlist: basePlan.resortShortlist };
  const locationHint = plan.itineraries[0]?.resortName ?? "resort";
  const poiResults = await fetchNearbyPOIs(spec, locationHint);
  const decisionMatrix = plan.itineraries.map((itinerary) => buildDecisionMatrixRow(spec, itinerary));
  const opsBoard = buildOpsBoard(spec);
  return { ...plan, poiResults, budgetSummary: budgetGraph.summary, decisionMatrix, opsBoard };
}

function buildDecisionMatrixRow(spec: TripSpec, itinerary: ItineraryPlan["itineraries"][number]): DecisionMatrixRow {
  const resort = findResortByName(itinerary.resortName);
  const topLodging = itinerary.liveOptions?.lodging?.[0];
  const walkabilityScore =
    typeof topLodging?.walkMinutesToLift === "number"
      ? clampScore(1 - topLodging.walkMinutesToLift / 30)
      : 0.5;
  const amenityScore =
    topLodging
      ? clampScore((Number(topLodging.hotTub) + Number(topLodging.laundry) + Number(topLodging.kitchen)) / 3)
      : 0.5;
  const passFit = derivePassFit(spec, itinerary.resortName);
  const travelScore = deriveTravelFitScore(spec, itinerary, resort);
  const budgetFit = deriveBudgetFitScore(itinerary);
  const snowSkillScore = resort ? clampScore(scoreResortForTrip(spec, resort, itinerary.dateRange?.start).score) : 0.5;
  const lodgingFit = deriveLodgingFitScore(spec, itinerary, topLodging, walkabilityScore, amenityScore);
  const overallScore = clampScore(
    budgetFit * 0.32 + passFit * 0.2 + snowSkillScore * 0.2 + lodgingFit * 0.18 + travelScore * 0.1
  );

  const budgetDetail = buildBudgetDetail(itinerary);
  const passDetail = buildPassDetail(spec, itinerary.resortName);
  const travelDetail = buildTravelDetail(spec, itinerary, resort);
  const lodgingDetail = buildLodgingDetail(itinerary, topLodging, walkabilityScore, amenityScore);
  const snowDetail =
    resort && itinerary.dateRange?.start
      ? `Snow+skill score from historical conditions and terrain match for ${itinerary.dateRange.start}.`
      : "Snow+skill score uses terrain mix and historical conditions.";

  return {
    itineraryId: itinerary.id,
    resortName: itinerary.resortName,
    totalCostPerPerson: itinerary.budgetEstimate?.perPersonTotal ?? null,
    overallScore,
    budgetFitScore: budgetFit,
    snowSkillScore,
    lodgingFitScore: lodgingFit,
    passFitScore: passFit,
    travelFitScore: travelScore,
    locked:
      spec.locks.lockedItineraryId === itinerary.id ||
      spec.locks.lockedResortName?.toLowerCase() === itinerary.resortName.toLowerCase(),
    details: {
      budget: budgetDetail,
      pass: passDetail,
      snowSkill: snowDetail,
      lodging: lodgingDetail,
      travel: travelDetail,
      overall: "Overall score = 32% budget + 20% pass + 20% snow/skill + 18% lodging + 10% travel."
    }
  };
}

function derivePassFit(spec: TripSpec, resortName: string): number {
  const passes = spec.notes.passes;
  if (!passes) return 0.5;
  const resort = findResortByName(resortName);
  const groupSize = spec.group.size ?? 1;
  if (!resort) return 0.5;

  const covered =
    (resort.passPrograms.includes("ikon") ? passes.ikonCount ?? 0 : 0) +
    (resort.passPrograms.includes("epic") ? passes.epicCount ?? 0 : 0) +
    (resort.passPrograms.includes("indy") ? passes.indyCount ?? 0 : 0) +
    (resort.passPrograms.includes("mountain_collective") ? passes.mountainCollectiveCount ?? 0 : 0);
  return clampScore(covered / groupSize);
}

function deriveTravelFitScore(
  spec: TripSpec,
  itinerary: ItineraryPlan["itineraries"][number],
  resort: ReturnType<typeof findResortByName>
): number {
  if (spec.travel.noFlying) {
    const driveHours = estimateDriveHours(resort?.id);
    if (typeof spec.travel.maxDriveHours === "number" && driveHours !== null) {
      return clampScore(1 - Math.max(0, driveHours - spec.travel.maxDriveHours) / 6);
    }
    if (typeof spec.travel.maxDriveHours === "number") {
      return clampScore(1 - spec.travel.maxDriveHours / 12);
    }
    return 0.6;
  }
  const requiresAirCarPlanning = Boolean(spec.travel.arrivalAirport);
  const hasCars = (itinerary.liveOptions?.cars?.length ?? 0) > 0;
  if (!resort) return hasCars ? 0.7 : 0.45;
  const airportMatch = spec.travel.arrivalAirport ? spec.travel.arrivalAirport === resort.nearestAirport : true;
  const base = airportMatch ? 0.88 : 0.62;
  if (!requiresAirCarPlanning) return clampScore(base);
  return clampScore(base - (hasCars ? 0 : 0.18));
}

function deriveBudgetFitScore(itinerary: ItineraryPlan["itineraries"][number]): number {
  const est = itinerary.budgetEstimate?.perPersonTotal;
  const target = itinerary.budgetEstimate?.targetPerPerson;
  if (typeof est !== "number") return 0.5;
  if (typeof target !== "number" || target <= 0) return 0.65;
  if (est <= target) {
    const underPct = Math.min(0.25, (target - est) / target);
    return clampScore(0.85 + underPct * 0.6);
  }
  const overPct = (est - target) / target;
  return clampScore(1 - Math.min(0.95, overPct / 0.8));
}

function deriveLodgingFitScore(
  spec: TripSpec,
  itinerary: ItineraryPlan["itineraries"][number],
  lodging: LodgingOption | undefined,
  walkabilityScore: number,
  amenityScore: number
): number {
  if (!lodging) return 0.5;
  let score = 0.2 + walkabilityScore * 0.22 + amenityScore * 0.18;
  if (spec.lodgingConstraints.hotTubRequired && lodging.hotTub) score += 0.15;
  if (spec.lodgingConstraints.laundryRequired && lodging.laundry) score += 0.15;
  if (spec.lodgingConstraints.kitchenRequired && lodging.kitchen) score += 0.15;
  if (typeof spec.lodgingConstraints.minBedrooms === "number" && lodging.bedrooms >= spec.lodgingConstraints.minBedrooms) {
    score += 0.1;
  }
  const units = lodging.unitsNeededForGroup ?? 1;
  const capacityScore = units === 1 ? 1 : clampScore(1 / units);
  score += capacityScore * 0.18;

  const housingTarget = itinerary.budgetEstimate?.components.housing;
  if (typeof housingTarget === "number" && housingTarget > 0 && typeof lodging.groupTotalEstimateUsd === "number") {
    const groupSize = Math.max(1, spec.group.size ?? 1);
    const perPersonLodging = lodging.groupTotalEstimateUsd / groupSize;
    const diffPct = Math.abs(perPersonLodging - housingTarget) / housingTarget;
    score += clampScore(1 - Math.min(1, diffPct)) * 0.12;
  } else {
    score += 0.06;
  }
  return clampScore(score);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function shouldIncludeCars(spec: TripSpec): boolean {
  return spec.travel.noFlying !== true && Boolean(spec.travel.arrivalAirport);
}

function buildBudgetDetail(itinerary: ItineraryPlan["itineraries"][number]): string {
  const total = itinerary.budgetEstimate?.perPersonTotal;
  const target = itinerary.budgetEstimate?.targetPerPerson;
  if (typeof total !== "number") return "Budget fit score uses the available per-person estimate.";
  if (typeof target !== "number") return `Budget fit score uses estimated total $${total} pp without a strict target.`;
  const diff = total - target;
  const sign = diff > 0 ? "over" : "under";
  return `Budget fit compares estimated $${total} pp vs target $${target} (${Math.abs(diff)} ${sign}).`;
}

function buildPassDetail(spec: TripSpec, resortName: string): string {
  const resort = findResortByName(resortName);
  const passes = spec.notes.passes;
  const groupSize = spec.group.size ?? 1;
  if (!resort || !passes) return "Pass fit defaults when pass ownership or resort pass program is missing.";
  const covered =
    (resort.passPrograms.includes("ikon") ? passes.ikonCount ?? 0 : 0) +
    (resort.passPrograms.includes("epic") ? passes.epicCount ?? 0 : 0) +
    (resort.passPrograms.includes("indy") ? passes.indyCount ?? 0 : 0) +
    (resort.passPrograms.includes("mountain_collective") ? passes.mountainCollectiveCount ?? 0 : 0);
  return `Pass fit = ${covered}/${groupSize} travelers already covered at ${resort.name}.`;
}

function buildTravelDetail(
  spec: TripSpec,
  itinerary: ItineraryPlan["itineraries"][number],
  resort: ReturnType<typeof findResortByName>
): string {
  if (spec.travel.noFlying) {
    const driveHours = estimateDriveHours(resort?.id);
    if (typeof spec.travel.maxDriveHours === "number" && driveHours !== null) {
      return `Travel fit compares est. drive ${driveHours}h vs max ${spec.travel.maxDriveHours}h.`;
    }
    return "Travel fit uses driving preference and available constraints.";
  }
  const airport = spec.travel.arrivalAirport ?? resort?.nearestAirport ?? "nearby airport";
  const hasCars = (itinerary.liveOptions?.cars?.length ?? 0) > 0;
  return `Travel fit uses airport alignment (${airport}) and car availability (${hasCars ? "available" : "not loaded"}).`;
}

function buildLodgingDetail(
  itinerary: ItineraryPlan["itineraries"][number],
  lodging: LodgingOption | undefined,
  walkabilityScore: number,
  amenityScore: number
): string {
  if (!lodging) return "Lodging fit defaults because no lodging options were returned.";
  const units = lodging.unitsNeededForGroup ?? 1;
  const walk = typeof lodging.walkMinutesToLift === "number" ? `${lodging.walkMinutesToLift} min walk` : "walk unknown";
  const perNight =
    typeof lodging.groupNightlyTotalUsd === "number"
      ? `$${lodging.groupNightlyTotalUsd}/night for group`
      : `$${lodging.nightlyRateUsd}/night`;
  return `Lodging fit uses ${units === 1 ? "single-unit" : `${units} units`} capacity, ${walk}, amenities ${Math.round(
    amenityScore * 100
  )}%, walk ${Math.round(walkabilityScore * 100)}%, and price ${perNight}.`;
}

function estimateDriveHours(resortId?: string | null): number | null {
  if (!resortId) return null;
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
  return table[resortId] ?? null;
}
