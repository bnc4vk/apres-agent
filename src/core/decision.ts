import { fetchNearbyPOIs, POIResults } from "./poi";
import { buildItineraries, ItineraryPlan } from "./itinerary";
import { TripSpec } from "./tripSpec";
import { runBudgetGraph, BudgetSummary } from "./budgetGraph";
import { buildResearchLinks } from "./researchLinks";
import { getCarProvider, getLodgingProvider } from "../adapters/providers";
import { CarOption, LodgingOption } from "./supply";
import { buildOpsBoard, OpsBoard } from "./opsBoard";

export type DecisionMatrixRow = {
  itineraryId: string;
  resortName: string;
  totalCostPerPerson: number | null;
  lodgingFitScore: number;
  passFitScore: number;
  travelBurdenScore: number;
  amenityFitScore: number;
  walkabilityScore: number;
  locked: boolean;
};

export type DecisionPackage = ItineraryPlan & {
  poiResults: POIResults;
  budgetSummary: BudgetSummary;
  decisionMatrix: DecisionMatrixRow[];
  opsBoard: OpsBoard;
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
  const travelScore = deriveTravelBurdenScore(spec, itinerary);
  const lodgingFit = deriveLodgingFitScore(spec, topLodging);

  return {
    itineraryId: itinerary.id,
    resortName: itinerary.resortName,
    totalCostPerPerson: itinerary.budgetEstimate?.perPersonTotal ?? null,
    lodgingFitScore: lodgingFit,
    passFitScore: passFit,
    travelBurdenScore: travelScore,
    amenityFitScore: amenityScore,
    walkabilityScore,
    locked:
      spec.locks.lockedItineraryId === itinerary.id ||
      spec.locks.lockedResortName?.toLowerCase() === itinerary.resortName.toLowerCase()
  };
}

function derivePassFit(spec: TripSpec, resortName: string): number {
  const passes = spec.notes.passes;
  if (!passes) return 0.5;
  const lower = resortName.toLowerCase();
  if (lower.includes("vail") || lower.includes("breckenridge") || lower.includes("keystone") || lower.includes("heavenly")) {
    const epicCount = passes.epicCount ?? 0;
    const groupSize = spec.group.size ?? 1;
    return clampScore(epicCount / groupSize);
  }
  const ikonCount = passes.ikonCount ?? 0;
  const groupSize = spec.group.size ?? 1;
  return clampScore(ikonCount / groupSize);
}

function deriveTravelBurdenScore(spec: TripSpec, itinerary: ItineraryPlan["itineraries"][number]): number {
  if (spec.travel.noFlying) {
    if (typeof spec.travel.maxDriveHours === "number") {
      return clampScore(1 - spec.travel.maxDriveHours / 12);
    }
    return 0.6;
  }
  const hasCars = (itinerary.liveOptions?.cars?.length ?? 0) > 0;
  return hasCars ? 0.72 : 0.45;
}

function deriveLodgingFitScore(spec: TripSpec, lodging: LodgingOption | undefined): number {
  if (!lodging) return 0.5;
  let score = 0.55;
  if (spec.lodgingConstraints.hotTubRequired && lodging.hotTub) score += 0.15;
  if (spec.lodgingConstraints.laundryRequired && lodging.laundry) score += 0.15;
  if (spec.lodgingConstraints.kitchenRequired && lodging.kitchen) score += 0.15;
  if (typeof spec.lodgingConstraints.minBedrooms === "number" && lodging.bedrooms >= spec.lodgingConstraints.minBedrooms) {
    score += 0.1;
  }
  return clampScore(score);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function shouldIncludeCars(spec: TripSpec): boolean {
  return spec.travel.noFlying === false || Boolean(spec.travel.arrivalAirport);
}
