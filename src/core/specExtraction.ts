import { ExtractionAssumption, SpecExtractionResult } from "../llm/client";
import { mergeTripSpec, SpecAssumption, TripSpec } from "./tripSpec";

export const CONFIDENCE_AUTO_CONFIRM = 0.85;
export const CONFIDENCE_ASSUMPTION = 0.6;

export type ExtractionApplyResult = {
  tripSpec: TripSpec;
  unresolvedPaths: string[];
  assumptionsAdded: SpecAssumption[];
  clarifyingQuestions: string[];
};

export function applyExtractionResult(spec: TripSpec, result: SpecExtractionResult): ExtractionApplyResult {
  const merged = mergeTripSpec(spec, result.patch);
  const turnCounter = (spec.extraction.turnCounter ?? 0) + 1;
  const now = new Date().toISOString();
  const unresolved = new Set<string>((result.unresolvedPaths ?? []).filter(Boolean));
  const fieldStates = { ...merged.extraction.fieldStates };
  const assumptions: SpecAssumption[] = [...merged.extraction.assumptions];
  const assumptionsByPath = new Map<string, ExtractionAssumption>(
    (result.assumptions ?? []).map((assumption) => [assumption.path, assumption])
  );
  const assumptionsAdded: SpecAssumption[] = [];

  for (const extracted of result.fieldStates ?? []) {
    if (!extracted.path) continue;
    const confidence = clampConfidence(extracted.confidence);
    let status: "confirmed" | "assumed" | "unresolved";
    if (confidence >= CONFIDENCE_AUTO_CONFIRM) {
      status = "confirmed";
    } else if (confidence >= CONFIDENCE_ASSUMPTION) {
      status = "assumed";
    } else {
      status = "unresolved";
    }
    if (unresolved.has(extracted.path)) {
      status = "unresolved";
    }

    fieldStates[extracted.path] = {
      confidence,
      evidence: extracted.evidence ?? "",
      status,
      sourceTurn: turnCounter,
      updatedAt: now
    };

    if (status === "unresolved") {
      unresolved.add(extracted.path);
      continue;
    }

    if (status === "assumed") {
      const modelAssumption = assumptionsByPath.get(extracted.path);
      const assumptionRecord: SpecAssumption = {
        path: extracted.path,
        rationale: modelAssumption?.rationale ?? "Inferred from current conversation context.",
        confidence: modelAssumption?.confidence ?? confidence,
        createdAt: now
      };
      assumptions.push(assumptionRecord);
      assumptionsAdded.push(assumptionRecord);
    }
  }

  const filteredUnresolved = filterUnresolvedForMissingFields([...unresolved], merged.status.missingFields);
  const nextSpec = mergeTripSpec(merged, {
    extraction: {
      fieldStates,
      assumptions,
      latestUnresolvedPaths: filteredUnresolved,
      turnCounter
    }
  });

  return {
    tripSpec: nextSpec,
    unresolvedPaths: filteredUnresolved,
    assumptionsAdded,
    clarifyingQuestions: result.clarifyingQuestions ?? []
  };
}

export function buildGeneralizedFollowup(
  unresolvedPaths: string[],
  missingFields: string[],
  clarifyingQuestions: string[]
): string {
  const missing = missingFields.slice(0, 2).map(toHumanMissingLabel);
  if (missing.length > 0) {
    return `I still need a bit more detail on ${missing.join(" and ")}.`;
  }

  const unresolved = unresolvedPaths.slice(0, 2).map(toHumanFieldLabel);
  if (unresolved.length > 0) {
    return `Could you clarify these details so I can finalize the plan: ${unresolved.join(" and ")}?`;
  }

  if (clarifyingQuestions.length > 0) {
    return clarifyingQuestions[0]!;
  }

  return "Could you share a bit more detail so I can lock the trip spec?";
}

const CRITICAL_UNRESOLVED_PREFIXES = [
  "dates",
  "group.size",
  "group.skillLevels",
  "gear",
  "budget",
  "notes.passes",
  "travel",
  "location",
  "travelers.pods"
];

export function filterActionableUnresolvedPaths(paths: string[]): string[] {
  return (paths ?? []).filter((path) =>
    CRITICAL_UNRESOLVED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}.`))
  );
}

const REQUIRED_PREFIXES_BY_MISSING_FIELD: Record<string, string[]> = {
  dates: ["dates"],
  group_size: ["group.size"],
  skill_levels: ["group.skillLevels"],
  gear_rental: ["gear"],
  budget: ["budget"],
  passes: ["notes.passes"],
  travel_restrictions: ["travel"],
  location_input: ["location"],
  traveler_pods: ["travelers.pods"],
  lodging_constraints: ["lodgingConstraints"],
  dining_constraints: ["diningConstraints"]
};

export function filterUnresolvedForMissingFields(paths: string[], missingFields: string[]): string[] {
  const requiredPrefixes = new Set<string>();
  for (const field of missingFields) {
    for (const prefix of REQUIRED_PREFIXES_BY_MISSING_FIELD[field] ?? []) {
      requiredPrefixes.add(prefix);
    }
  }
  if (requiredPrefixes.size === 0) return [];
  const prefixes = [...requiredPrefixes];
  return [...new Set(paths)].filter((path) =>
    prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`))
  );
}

function toHumanFieldLabel(path: string): string {
  return path.replace(/\./g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function toHumanMissingLabel(field: string): string {
  const labels: Record<string, string> = {
    dates: "dates",
    group_size: "group size",
    skill_levels: "skill levels",
    gear_rental: "gear rentals",
    budget: "budget",
    passes: "pass ownership",
    travel_restrictions: "travel restrictions",
    location_input: "location preferences",
    traveler_pods: "departure locations",
    lodging_constraints: "lodging constraints",
    dining_constraints: "dining constraints"
  };
  return labels[field] ?? field.replace(/_/g, " ");
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
}
