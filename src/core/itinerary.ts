import dayjs from "dayjs";
import { shortlistResorts } from "./resorts";
import { scoreResortForTrip } from "./snow";
import { TripSpec } from "./tripSpec";
import { buildResearchLinks, ResearchLinks } from "./researchLinks";

export type Itinerary = {
  id: string;
  title: string;
  resortName: string;
  dateRange: {
    start: string;
    end: string;
    label: string;
  };
  lodgingArea: string;
  summary: string;
  logistics: string[];
  warnings: string[];
  snowAssessment: string;
  lodgingBudgetPerPerson: number | null;
  researchLinks: ResearchLinks;
};

export type ItineraryPlan = {
  itineraries: Itinerary[];
  resortShortlist: string[];
};

export function buildItineraries(spec: TripSpec): ItineraryPlan {
  const resorts = shortlistResorts(spec, 3);
  const resortNames = resorts.map((resort) => resort.name);
  const dateCandidates = buildDateCandidates(spec, resorts.length);

  const itineraries: Itinerary[] = resorts.map((resort, index) => {
    const dateChoice = dateCandidates[index] ?? dateCandidates[0];
    const score = scoreResortForTrip(spec, resort, dateChoice?.start);
    const lodgingArea = chooseLodgingArea(spec, index);
    const warnings = buildWarnings(spec, score.snowOk, score.avgTempOk);
    const snowAssessment = buildSnowAssessment(score);

    return {
      id: `${resort.id}-${index + 1}`,
      title: `${resort.name} — Option ${index + 1}`,
      resortName: resort.name,
      dateRange: dateChoice,
      lodgingArea,
      summary: buildSummary(spec, resort.name, lodgingArea, dateChoice),
      logistics: buildLogistics(spec, resort.name),
      warnings,
      snowAssessment,
      lodgingBudgetPerPerson: estimateLodgingBudgetPerPerson(spec),
      researchLinks: buildResearchLinks(spec, resort.name)
    };
  });

  return { itineraries, resortShortlist: resortNames };
}

function chooseLodgingArea(spec: TripSpec, index: number): string {
  const band = spec.budget.band ?? "mid";
  const options = {
    low: ["off-mountain condos", "budget motels", "shared cabins"],
    mid: ["village condos", "family hotels", "ski-in shuttle hotels"],
    high: ["slopeside hotels", "luxury chalets", "premium residences"]
  } as const;
  return options[band][index % options[band].length];
}

function buildSummary(
  spec: TripSpec,
  resortName: string,
  lodgingArea: string,
  dateChoice?: { start: string; end: string; label: string }
): string {
  const dates = dateChoice?.label ?? formatDateRange(spec.dates.start, spec.dates.end);
  const group = spec.group.size ? `${spec.group.size} people` : "your group";
  const budgetNote = budgetLine(spec);
  return `A ${dates} trip for ${group} at ${resortName} with lodging in ${lodgingArea}. ${budgetNote}`;
}

function buildLogistics(spec: TripSpec, resortName: string): string[] {
  const logistics: string[] = [];
  if (spec.gear.rentalRequired) {
    logistics.push("Reserve gear rental near lodging with pickup aligned to arrival time.");
  } else {
    logistics.push("Plan gear transport and storage for personal equipment.");
  }

  if (spec.travel.noFlying) {
    logistics.push("Driving required; ensure departure locations are confirmed.");
  } else {
    logistics.push("If flying, compare nearby airports and rental car options.");
  }

  logistics.push(`Finalize daily itinerary blocks for ${resortName}.`);
  return logistics;
}

function buildWarnings(spec: TripSpec, snowOk: boolean, avgTempOk: boolean): string[] {
  const warnings: string[] = [];
  if (!snowOk) {
    warnings.push("Historical snow threshold not met for target month; consider flexibility.");
  }
  if (!avgTempOk) {
    warnings.push("Average temperature exceeds threshold; monitor forecast closely.");
  }
  if (spec.travel.noFlying && (!spec.travelers.pods || spec.travelers.pods.length === 0)) {
    warnings.push("Driving origins missing; final itinerary requires traveler departure pods.");
  }
  return warnings;
}

function buildSnowAssessment(score: { snowOk: boolean; avgTempOk: boolean; monthEvaluated: number | null }): string {
  if (!score.monthEvaluated) return "Historical snow assessment pending dates.";
  const monthName = dayjs().month(score.monthEvaluated - 1).format("MMMM");
  if (score.snowOk && score.avgTempOk) {
    return `${monthName} meets historical snow and temperature thresholds.`;
  }
  if (!score.snowOk && !score.avgTempOk) {
    return `${monthName} falls short on snow and temperature thresholds.`;
  }
  if (!score.snowOk) {
    return `${monthName} falls short on historical snowfall threshold.`;
  }
  return `${monthName} exceeds temperature threshold; snow quality may vary.`;
}

function estimateLodgingBudgetPerPerson(spec: TripSpec): number | null {
  if (spec.budget.perPersonMax) return Math.round(spec.budget.perPersonMax);
  const byBand = {
    low: 300,
    mid: 650,
    high: 1200
  };
  return spec.budget.band ? byBand[spec.budget.band] : null;
}

function budgetLine(spec: TripSpec): string {
  const perPerson = estimateLodgingBudgetPerPerson(spec);
  if (!perPerson) return "Lodging budget is still flexible.";
  return `Target lodging budget is about $${perPerson} per person total.`;
}

function formatDateRange(start?: string, end?: string): string {
  if (!start || !end) return "TBD dates";
  return `${start} to ${end}`;
}

function buildDateCandidates(spec: TripSpec, limit: number): Array<{ start: string; end: string; label: string }> {
  if (!spec.dates.start || !spec.dates.end) {
    return [{ start: "", end: "", label: "TBD dates" }];
  }

  const start = dayjs(spec.dates.start);
  const end = dayjs(spec.dates.end);
  const tripLength = spec.dates.tripLengthDays ?? 3;
  const preferWeekends = spec.dates.weekendsPreferred !== false;
  const candidates: Array<{ start: string; end: string; label: string }> = [];

  if (spec.dates.kind === "window" && preferWeekends) {
    let cursor = start.startOf("day");
    while (cursor.isBefore(end) || cursor.isSame(end)) {
      if (cursor.day() === 5) {
        const candidateEnd = cursor.add(tripLength - 1, "day");
        if (candidateEnd.isSame(end) || candidateEnd.isBefore(end)) {
          candidates.push({
            start: cursor.format("YYYY-MM-DD"),
            end: candidateEnd.format("YYYY-MM-DD"),
            label: `${cursor.format("YYYY-MM-DD")} to ${candidateEnd.format("YYYY-MM-DD")}`
          });
        }
      }
      cursor = cursor.add(1, "day");
      if (candidates.length >= limit) break;
    }
  }

  if (candidates.length === 0 && spec.dates.kind === "window") {
    let cursor = start.startOf("day");
    while (cursor.isBefore(end) || cursor.isSame(end)) {
      const candidateEnd = cursor.add(tripLength - 1, "day");
      if (candidateEnd.isSame(end) || candidateEnd.isBefore(end)) {
        candidates.push({
          start: cursor.format("YYYY-MM-DD"),
          end: candidateEnd.format("YYYY-MM-DD"),
          label: `${cursor.format("YYYY-MM-DD")} to ${candidateEnd.format("YYYY-MM-DD")}`
        });
      }
      cursor = cursor.add(7, "day");
      if (candidates.length >= limit) break;
    }
  }

  if (spec.dates.kind !== "window") {
    candidates.push({
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
      label: `${start.format("YYYY-MM-DD")} to ${end.format("YYYY-MM-DD")}`
    });
  }

  return candidates.length > 0
    ? candidates
    : [
        {
          start: start.format("YYYY-MM-DD"),
          end: end.format("YYYY-MM-DD"),
          label: `${start.format("YYYY-MM-DD")} to ${end.format("YYYY-MM-DD")}`
        }
      ];
}
