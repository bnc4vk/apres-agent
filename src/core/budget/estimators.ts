import dayjs from "dayjs";
import { fetchLiveFlightPrice, fetchLiveHotelNightlyPrice, PriceSource } from "../../integrations/serpPricing";
import { findResortByName, Resort } from "../resorts";
import { TripSpec } from "../tripSpec";
import { fallbackFlightPrice, resolveOriginAirport } from "./origins";
import { BudgetComponentEstimate, BudgetGraphInputItinerary, ItineraryBudgetEstimate } from "./types";

export async function estimateItineraryBudget(
  spec: TripSpec,
  itinerary: BudgetGraphInputItinerary
): Promise<ItineraryBudgetEstimate> {
  const groupSize = spec.group.size ?? 4;
  const assumptions: string[] = [];
  if (!spec.group.size) assumptions.push("Assumed group size of 4 people for budget calculations.");

  const resort = findResortByName(itinerary.resortName);
  const tripDays = getTripDays(spec, itinerary, assumptions);
  const tripNights = Math.max(1, tripDays - 1);

  const pass = estimatePassCost(spec, resort, groupSize, tripDays, assumptions);
  const travel = await estimateTravelCost(spec, resort, groupSize, itinerary, assumptions);
  const food = estimateFoodCost(spec, tripDays);
  const gear = estimateGearCost(spec, groupSize, tripDays, assumptions);
  const housing = await estimateHousingCost(spec, resort, groupSize, tripNights, itinerary, assumptions);

  const components: BudgetComponentEstimate[] = [pass, travel, food, gear, housing];
  const perPersonTotal = round(components.reduce((sum, item) => sum + item.perPerson, 0));
  const groupTotal = round(perPersonTotal * groupSize);
  const targetPerPerson = estimateBudgetTargetPerPerson(spec, groupSize);
  const shortfallPerPerson = targetPerPerson ? Math.max(0, round(perPersonTotal - targetPerPerson)) : 0;
  const feasible = targetPerPerson ? shortfallPerPerson <= 0 : true;

  return {
    itineraryId: itinerary.id,
    resortName: itinerary.resortName,
    perPersonTotal,
    groupTotal,
    feasible,
    shortfallPerPerson,
    targetPerPerson,
    components,
    assumptions,
    nightlyLodgingCap: housing.perPerson > 0 ? round(housing.perPerson / Math.max(1, tripNights)) : null
  };
}

export function buildSummaryLine(estimate: ItineraryBudgetEstimate): string {
  const total = `$${estimate.perPersonTotal.toLocaleString()}`;
  if (!estimate.targetPerPerson) {
    return `Budget check: estimated ${total} per person across passes, travel, food, gear, and housing.`;
  }

  const target = `$${estimate.targetPerPerson.toLocaleString()}`;
  if (estimate.feasible) {
    return `Budget check: estimated ${total} per person, within your target of ${target}.`;
  }

  const shortfall = `$${estimate.shortfallPerPerson.toLocaleString()}`;
  return `Budget check: estimated ${total} per person vs target ${target} (about ${shortfall} over). Constraints may be unrealistic.`;
}

function estimatePassCost(
  spec: TripSpec,
  resort: Resort | null,
  groupSize: number,
  tripDays: number,
  assumptions: string[]
): BudgetComponentEstimate {
  const programs = new Set(resort?.passPrograms ?? []);
  const passData = spec.notes.passes;
  const holdersForResort =
    (programs.has("ikon") ? passData?.ikonCount ?? 0 : 0) +
    (programs.has("epic") ? passData?.epicCount ?? 0 : 0) +
    (programs.has("indy") ? passData?.indyCount ?? 0 : 0) +
    (programs.has("mountain_collective") ? passData?.mountainCollectiveCount ?? 0 : 0);

  const explicitNoPass = passData?.noPassCount;
  let uncoveredCount = typeof explicitNoPass === "number" ? explicitNoPass : Math.max(0, groupSize - holdersForResort);
  if (!passData || passData.confirmed !== true) {
    assumptions.push("Used inferred pass coverage because pass ownership details were incomplete.");
  }
  if (uncoveredCount > groupSize) uncoveredCount = groupSize;

  const dayPassRate = resort?.state === "Colorado" ? 240 : 220;
  const perPerson = (uncoveredCount / groupSize) * dayPassRate * tripDays;
  return { key: "pass", label: "Ski pass", perPerson: round(perPerson), source: "estimated" };
}

async function estimateTravelCost(
  spec: TripSpec,
  resort: Resort | null,
  groupSize: number,
  itinerary: BudgetGraphInputItinerary,
  assumptions: string[]
): Promise<BudgetComponentEstimate> {
  if (spec.travel.noFlying) {
    const drivePerPerson = estimateDrivePerPerson(spec, groupSize);
    assumptions.push("Estimated drive costs from regional road-trip assumptions.");
    return { key: "travel", label: "Flights / travel", perPerson: round(drivePerPerson), source: "estimated" };
  }

  const destination = spec.travel.arrivalAirport ?? resort?.nearestAirport ?? "DEN";
  const pods = spec.travelers.pods ?? [];

  let weightedSum = 0;
  let weightedCount = 0;
  let liveUsed = false;

  for (const pod of pods) {
    const resolved = resolveOriginAirport(pod.origin);
    const count = pod.count > 0 ? pod.count : 0;
    if (count === 0) continue;

    const fallback = fallbackFlightPrice(resolved.region, resort?.state ?? "Colorado");
    let perPerson = fallback;

    const departDate = itinerary.dateRange?.start ?? spec.dates.start;
    const returnDate = itinerary.dateRange?.end ?? spec.dates.end;
    if (resolved.airport && departDate && returnDate) {
      const live = await fetchLiveFlightPrice({
        originAirport: resolved.airport,
        destinationAirport: destination,
        departDate,
        returnDate
      });
      if (live) {
        perPerson = live;
        liveUsed = true;
      }
    }

    weightedSum += perPerson * count;
    weightedCount += count;
  }

  if (weightedCount === 0) {
    const fallback = fallbackFlightPrice("east", resort?.state ?? "Colorado");
    weightedSum = fallback * groupSize;
    weightedCount = groupSize;
    assumptions.push("Assumed East Coast origin for flights due missing departure pod details.");
  }

  const averageFlight = weightedSum / Math.max(1, weightedCount);
  const transferPerPerson = resort ? 75 : 95;
  const source: PriceSource = liveUsed ? "live" : "estimated";
  if (!liveUsed) assumptions.push("Used estimated round-trip flight costs where live fare quotes were unavailable.");

  return {
    key: "travel",
    label: "Flights / travel",
    perPerson: round(averageFlight + transferPerPerson),
    source
  };
}

function estimateDrivePerPerson(spec: TripSpec, groupSize: number): number {
  const pods = spec.travelers.pods ?? [];
  if (pods.length === 0) return 160;

  const perMileCost = 0.42;
  const averageRoundTripMiles = 360;
  const ridersPerCar = 3.5;
  const cars = Math.max(1, Math.ceil(groupSize / ridersPerCar));
  const total = cars * averageRoundTripMiles * perMileCost;
  return total / Math.max(1, groupSize);
}

function estimateFoodCost(spec: TripSpec, tripDays: number): BudgetComponentEstimate {
  const perDayByBand = { low: 70, mid: 100, high: 155 };
  const band = spec.budget.band ?? "mid";
  return {
    key: "food",
    label: "Food",
    perPerson: round(perDayByBand[band] * tripDays),
    source: "estimated"
  };
}

function estimateGearCost(
  spec: TripSpec,
  groupSize: number,
  tripDays: number,
  assumptions: string[]
): BudgetComponentEstimate {
  const dayRate = 62;
  let rentalCount = 0;

  if (typeof spec.gear.rentalCount === "number") {
    rentalCount = Math.min(groupSize, spec.gear.rentalCount);
  } else if (typeof spec.gear.rentalShare === "number") {
    rentalCount = Math.min(groupSize, Math.round(spec.gear.rentalShare * groupSize));
  } else if (spec.gear.rentalRequired === true) {
    rentalCount = Math.round(groupSize * 0.6);
    assumptions.push("Assumed 60% of group needs rentals because exact rental count was missing.");
  }

  const perPerson = (rentalCount / Math.max(1, groupSize)) * dayRate * tripDays;
  return {
    key: "gear_rental",
    label: "Gear rental",
    perPerson: round(perPerson),
    source: "estimated"
  };
}

async function estimateHousingCost(
  spec: TripSpec,
  resort: Resort | null,
  groupSize: number,
  tripNights: number,
  itinerary: BudgetGraphInputItinerary,
  assumptions: string[]
): Promise<BudgetComponentEstimate> {
  const occupancy = 2.2;
  const rooms = Math.max(1, Math.ceil(groupSize / occupancy));

  const checkInDate = itinerary.dateRange?.start ?? spec.dates.start;
  const checkOutDate = itinerary.dateRange?.end ?? spec.dates.end;

  let nightlyRoomRate: number | null = null;
  if (checkInDate && checkOutDate) {
    nightlyRoomRate = await fetchLiveHotelNightlyPrice({
      locationQuery: `${itinerary.resortName} ski lodging`,
      checkInDate,
      checkOutDate,
      adults: Math.max(1, groupSize)
    });
  }

  let source: PriceSource = "live";
  if (!nightlyRoomRate) {
    source = "estimated";
    nightlyRoomRate = fallbackRoomNightlyRate(spec, resort?.state ?? "Colorado");
    assumptions.push("Used estimated lodging prices where live hotel quotes were unavailable.");
  }

  const total = nightlyRoomRate * tripNights * rooms;
  return {
    key: "housing",
    label: "Housing",
    perPerson: round(total / Math.max(1, groupSize)),
    source
  };
}

function fallbackRoomNightlyRate(spec: TripSpec, state: string): number {
  const table =
    state === "California"
      ? { low: 215, mid: 325, high: 560 }
      : { low: 240, mid: 360, high: 620 };
  const band = spec.budget.band ?? "mid";
  return table[band];
}

function estimateBudgetTargetPerPerson(spec: TripSpec, groupSize: number): number | null {
  if (typeof spec.budget.perPersonMax === "number") return round(spec.budget.perPersonMax);
  if (typeof spec.budget.totalMax === "number") return round(spec.budget.totalMax / Math.max(1, groupSize));

  if (spec.budget.band === "low") return 850;
  if (spec.budget.band === "mid") return 1500;
  if (spec.budget.band === "high") return 2800;
  return null;
}

function getTripDays(spec: TripSpec, itinerary: BudgetGraphInputItinerary, assumptions: string[]): number {
  const start = itinerary.dateRange?.start ?? spec.dates.start;
  const end = itinerary.dateRange?.end ?? spec.dates.end;
  if (!start || !end) {
    assumptions.push("Assumed 3 trip days because date range was missing.");
    return 3;
  }

  const startDate = dayjs(start);
  const endDate = dayjs(end);
  if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) {
    assumptions.push("Assumed 3 trip days due invalid date range.");
    return 3;
  }

  return Math.max(1, endDate.diff(startDate, "day") + 1);
}

function round(value: number): number {
  return Math.round(value);
}
