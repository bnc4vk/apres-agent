import dayjs from "dayjs";
import { nanoid } from "nanoid";
import { z } from "zod";

export const SkillLevelSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
  "expert"
]);
export type SkillLevel = z.infer<typeof SkillLevelSchema>;

export const BudgetBandSchema = z.enum(["low", "mid", "high"]);
export type BudgetBand = z.infer<typeof BudgetBandSchema>;

export const ConstraintModeSchema = z.enum(["hard", "soft"]);
export type ConstraintMode = z.infer<typeof ConstraintModeSchema>;

export const RoomingStyleSchema = z.enum(["couples", "singles", "hybrid"]);
export type RoomingStyle = z.infer<typeof RoomingStyleSchema>;

export const RiderTypeSchema = z.enum(["skiers", "snowboarders", "hybrid"]);
export type RiderType = z.infer<typeof RiderTypeSchema>;

export const RentalTypeSchema = z.enum(["skiers", "snowboarders", "both"]);
export type RentalType = z.infer<typeof RentalTypeSchema>;

export const FieldConfidenceStatusSchema = z.enum(["confirmed", "assumed", "unresolved"]);
export type FieldConfidenceStatus = z.infer<typeof FieldConfidenceStatusSchema>;

export const ExtractedFieldStateSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    evidence: z.string(),
    status: FieldConfidenceStatusSchema,
    sourceTurn: z.number().int().min(0).optional(),
    updatedAt: z.string().optional()
  })
  .strict();
export type ExtractedFieldState = z.infer<typeof ExtractedFieldStateSchema>;

export const SpecAssumptionSchema = z
  .object({
    path: z.string(),
    rationale: z.string(),
    confidence: z.number().min(0).max(1),
    createdAt: z.string()
  })
  .strict();
export type SpecAssumption = z.infer<typeof SpecAssumptionSchema>;

export const PendingSpecAssumptionSchema = z
  .object({
    id: z.string(),
    field: z.string(),
    label: z.string(),
    assumption: z.string(),
    createdAt: z.string()
  })
  .strict();
export type PendingSpecAssumption = z.infer<typeof PendingSpecAssumptionSchema>;

export const TravelerPodSchema = z.object({
  origin: z.string().min(2),
  count: z.number().int().positive()
});
export type TravelerPod = z.infer<typeof TravelerPodSchema>;

export const PassOwnershipSchema = z
  .object({
    ikonCount: z.number().int().min(0).optional(),
    epicCount: z.number().int().min(0).optional(),
    indyCount: z.number().int().min(0).optional(),
    mountainCollectiveCount: z.number().int().min(0).optional(),
    noPassCount: z.number().int().min(0).optional(),
    otherPasses: z.array(z.string()).optional(),
    notes: z.string().optional(),
    confirmed: z.boolean().optional()
  })
  .strict();
export type PassOwnership = z.infer<typeof PassOwnershipSchema>;

export const TripSpecSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  group: z.object({
    size: z.number().int().positive().optional(),
    skillLevels: z.array(SkillLevelSchema).optional(),
    riderType: RiderTypeSchema.optional(),
    notes: z.string().optional()
  }),
  groupComposition: z.object({
    couplesCount: z.number().int().min(0).optional(),
    singlesCount: z.number().int().min(0).optional(),
    roomingStyle: RoomingStyleSchema.optional(),
    confirmed: z.boolean().optional()
  }),
  gear: z.object({
    rentalRequired: z.boolean().optional(),
    rentalCount: z.number().int().positive().optional(),
    rentalType: RentalTypeSchema.optional(),
    rentalShare: z.number().min(0).max(1).optional(),
    rentalNotes: z.string().optional(),
    confirmed: z.boolean().optional()
  }),
  budget: z.object({
    band: BudgetBandSchema.optional(),
    perPersonMax: z.number().positive().optional(),
    totalMax: z.number().positive().optional(),
    currency: z.string().optional(),
    confirmed: z.boolean().optional()
  }),
  travel: z.object({
    noFlying: z.boolean().optional(),
    maxDriveHours: z.number().positive().optional(),
    arrivalAirport: z.string().optional(),
    canFlyCount: z.number().int().min(0).optional(),
    cannotFlyCount: z.number().int().min(0).optional(),
    restrictions: z.array(z.string()).optional(),
    notes: z.string().optional(),
    confirmed: z.boolean().optional()
  }),
  dates: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
    kind: z.enum(["exact", "window"]).optional(),
    weekendsPreferred: z.boolean().optional(),
    tripLengthDays: z.number().int().positive().optional(),
    yearConfirmed: z.boolean().optional(),
    flexibleDays: z.number().int().min(0).optional()
  }),
  location: z.object({
    resort: z.string().optional(),
    region: z.string().optional(),
    state: z.string().optional(),
    nearMajorAirport: z.boolean().optional(),
    openToSuggestions: z.boolean().optional(),
    confirmed: z.boolean().optional()
  }),
  lodgingConstraints: z.object({
    maxWalkMinutesToLift: z.number().int().positive().optional(),
    hotTubRequired: z.boolean().optional(),
    laundryRequired: z.boolean().optional(),
    minBedrooms: z.number().int().positive().optional(),
    kitchenRequired: z.boolean().optional(),
    constraintMode: ConstraintModeSchema.optional(),
    confirmed: z.boolean().optional()
  }),
  diningConstraints: z.object({
    mustSupportTakeout: z.boolean().optional(),
    minGroupCapacity: z.number().int().positive().optional(),
    mustBeReservable: z.boolean().optional(),
    constraintMode: ConstraintModeSchema.optional(),
    confirmed: z.boolean().optional()
  }),
  organizerOps: z.object({
    wantsGroupChatSetup: z.boolean().optional(),
    wantsSplitwiseSetup: z.boolean().optional(),
    confirmed: z.boolean().optional()
  }),
  locks: z.object({
    lockedItineraryId: z.string().optional(),
    lockedResortName: z.string().optional(),
    lockedStartDate: z.string().optional(),
    lockedEndDate: z.string().optional()
  }),
  extraction: z.object({
    fieldStates: z.record(ExtractedFieldStateSchema),
    assumptions: z.array(SpecAssumptionSchema),
    pendingAssumptions: z.array(PendingSpecAssumptionSchema),
    latestUnresolvedPaths: z.array(z.string()),
    turnCounter: z.number().int().min(0)
  }),
  travelers: z.object({
    pods: z.array(TravelerPodSchema).optional()
  }),
  notes: z.object({
    wantsMoreItineraryDetails: z.boolean().optional(),
    passes: PassOwnershipSchema.optional()
  }),
  status: z.object({
    readyToGenerate: z.boolean(),
    missingFields: z.array(z.string())
  })
});
export type TripSpec = z.infer<typeof TripSpecSchema>;

export type TripSpecPatch = Partial<Omit<TripSpec, "id" | "createdAt" | "status" | "extraction">> & {
  extraction?: Partial<TripSpec["extraction"]>;
};

export const TripSpecPatchSchema = z
  .object({
    group: TripSpecSchema.shape.group.partial().optional(),
    groupComposition: TripSpecSchema.shape.groupComposition.partial().optional(),
    gear: TripSpecSchema.shape.gear.partial().optional(),
    budget: TripSpecSchema.shape.budget.partial().optional(),
    travel: TripSpecSchema.shape.travel.partial().optional(),
    dates: TripSpecSchema.shape.dates.partial().optional(),
    location: TripSpecSchema.shape.location.partial().optional(),
    lodgingConstraints: TripSpecSchema.shape.lodgingConstraints.partial().optional(),
    diningConstraints: TripSpecSchema.shape.diningConstraints.partial().optional(),
    organizerOps: TripSpecSchema.shape.organizerOps.partial().optional(),
    locks: TripSpecSchema.shape.locks.partial().optional(),
    extraction: z
      .object({
        fieldStates: z.record(ExtractedFieldStateSchema).optional(),
        assumptions: z.array(SpecAssumptionSchema).optional(),
        pendingAssumptions: z.array(PendingSpecAssumptionSchema).optional(),
        latestUnresolvedPaths: z.array(z.string()).optional(),
        turnCounter: z.number().int().min(0).optional()
      })
      .partial()
      .optional(),
    travelers: TripSpecSchema.shape.travelers.partial().optional(),
    notes: TripSpecSchema.shape.notes.partial().optional(),
    updatedAt: z.string().optional()
  })
  .strict();

export function createEmptyTripSpec(): TripSpec {
  const now = new Date().toISOString();
  const spec: TripSpec = {
    id: nanoid(),
    createdAt: now,
    updatedAt: now,
    group: {},
    groupComposition: {},
    gear: {},
    budget: {},
    travel: {},
    dates: {},
    location: {},
    lodgingConstraints: {},
    diningConstraints: {},
    organizerOps: {},
    locks: {},
    extraction: {
      fieldStates: {},
      assumptions: [],
      pendingAssumptions: [],
      latestUnresolvedPaths: [],
      turnCounter: 0
    },
    travelers: {},
    notes: {},
    status: {
      readyToGenerate: false,
      missingFields: []
    }
  };
  return updateTripSpecStatus(spec);
}

export function mergeTripSpec(spec: TripSpec, patch: TripSpecPatch): TripSpec {
  const merged: TripSpec = {
    ...spec,
    ...patch,
    group: { ...spec.group, ...patch.group },
    groupComposition: { ...spec.groupComposition, ...patch.groupComposition },
    gear: { ...spec.gear, ...patch.gear },
    budget: { ...spec.budget, ...patch.budget },
    travel: { ...spec.travel, ...patch.travel },
    dates: { ...spec.dates, ...patch.dates },
    location: { ...spec.location, ...patch.location },
    lodgingConstraints: { ...spec.lodgingConstraints, ...patch.lodgingConstraints },
    diningConstraints: { ...spec.diningConstraints, ...patch.diningConstraints },
    organizerOps: { ...spec.organizerOps, ...patch.organizerOps },
    locks: { ...spec.locks, ...patch.locks },
    extraction: {
      fieldStates: { ...spec.extraction.fieldStates, ...patch.extraction?.fieldStates },
      assumptions: patch.extraction?.assumptions ?? spec.extraction.assumptions,
      pendingAssumptions: patch.extraction?.pendingAssumptions ?? spec.extraction.pendingAssumptions,
      latestUnresolvedPaths: patch.extraction?.latestUnresolvedPaths ?? spec.extraction.latestUnresolvedPaths,
      turnCounter: patch.extraction?.turnCounter ?? spec.extraction.turnCounter
    },
    travelers: { ...spec.travelers, ...patch.travelers },
    notes: { ...spec.notes, ...patch.notes },
    status: spec.status
  };
  merged.updatedAt = new Date().toISOString();
  return updateTripSpecStatus(merged);
}

export function normalizeTripSpec(input: unknown): TripSpec {
  if (!input || typeof input !== "object") {
    return createEmptyTripSpec();
  }
  const base = createEmptyTripSpec();
  const parsed = TripSpecSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }
  const candidate = input as Partial<TripSpec>;
  return updateTripSpecStatus({
    ...base,
    ...candidate,
    group: { ...base.group, ...(candidate.group ?? {}) },
    groupComposition: { ...base.groupComposition, ...(candidate.groupComposition ?? {}) },
    gear: { ...base.gear, ...(candidate.gear ?? {}) },
    budget: { ...base.budget, ...(candidate.budget ?? {}) },
    travel: { ...base.travel, ...(candidate.travel ?? {}) },
    dates: { ...base.dates, ...(candidate.dates ?? {}) },
    location: { ...base.location, ...(candidate.location ?? {}) },
    lodgingConstraints: { ...base.lodgingConstraints, ...(candidate.lodgingConstraints ?? {}) },
    diningConstraints: { ...base.diningConstraints, ...(candidate.diningConstraints ?? {}) },
    organizerOps: { ...base.organizerOps, ...(candidate.organizerOps ?? {}) },
    locks: { ...base.locks, ...(candidate.locks ?? {}) },
    extraction: {
      fieldStates: {
        ...base.extraction.fieldStates,
        ...((candidate.extraction as any)?.fieldStates ?? {})
      },
      assumptions: (candidate.extraction as any)?.assumptions ?? base.extraction.assumptions,
      pendingAssumptions:
        (candidate.extraction as any)?.pendingAssumptions ?? base.extraction.pendingAssumptions,
      latestUnresolvedPaths:
        (candidate.extraction as any)?.latestUnresolvedPaths ?? base.extraction.latestUnresolvedPaths,
      turnCounter: (candidate.extraction as any)?.turnCounter ?? base.extraction.turnCounter
    },
    travelers: { ...base.travelers, ...(candidate.travelers ?? {}) },
    notes: { ...base.notes, ...(candidate.notes ?? {}) },
    status: base.status
  });
}

export function updateTripSpecStatus(spec: TripSpec): TripSpec {
  const derived = applyDerivedPassCounts(spec);
  const missingFields = determineMissingFields(derived);
  return {
    ...derived,
    status: {
      readyToGenerate: missingFields.length === 0,
      missingFields
    }
  };
}

function applyDerivedPassCounts(spec: TripSpec): TripSpec {
  const passes = spec.notes.passes;
  const groupSize = spec.group.size;
  if (!passes || !passes.notes || !groupSize || groupSize <= 0) return spec;

  const inferred = inferPassCountsFromNotes(passes.notes, groupSize);
  if (!inferred) return spec;

  const nextPasses = {
    ...passes,
    ikonCount: passes.ikonCount ?? inferred.ikonCount,
    epicCount: passes.epicCount ?? inferred.epicCount,
    indyCount: passes.indyCount ?? inferred.indyCount,
    mountainCollectiveCount: passes.mountainCollectiveCount ?? inferred.mountainCollectiveCount,
    noPassCount: passes.noPassCount ?? inferred.noPassCount
  };
  return {
    ...spec,
    notes: {
      ...spec.notes,
      passes: nextPasses
    }
  };
}

function inferPassCountsFromNotes(
  notes: string,
  groupSize: number
):
  | {
      ikonCount?: number;
      epicCount?: number;
      indyCount?: number;
      mountainCollectiveCount?: number;
      noPassCount?: number;
    }
  | null {
  const text = notes.toLowerCase();
  if (!text.trim()) return null;

  const result: {
    ikonCount?: number;
    epicCount?: number;
    indyCount?: number;
    mountainCollectiveCount?: number;
    noPassCount?: number;
  } = {};

  const wholeGroupNoPassPhrase =
    /\b(no one has passes?|nobody has passes?|none (?:have|has) passes?|without any passes?|everyone has no pass(?:es)?|all have no pass(?:es)?)\b/.test(
      text
    );
  if (wholeGroupNoPassPhrase) {
    result.noPassCount = groupSize;
    return result;
  }

  const passPatterns: Array<{ key: keyof typeof result; label: string; tokens: RegExp[] }> = [
    { key: "ikonCount", label: "ikon", tokens: [/\bikon\b/] },
    { key: "epicCount", label: "epic", tokens: [/\bepic\b/] },
    { key: "indyCount", label: "indy", tokens: [/\bindy\b/] },
    { key: "mountainCollectiveCount", label: "mountain collective", tokens: [/\bmountain collective\b/] },
    { key: "noPassCount", label: "no pass", tokens: [/\bno pass(?:es)?\b/] }
  ];

  let assigned = 0;
  for (const pattern of passPatterns) {
    if (!pattern.tokens.some((token) => token.test(text))) continue;
    const count = inferCountNearToken(text, pattern.label, groupSize);
    if (typeof count === "number") {
      result[pattern.key] = count;
      assigned += count;
    }
  }

  if (assigned === 0) return null;
  if (assigned < groupSize && /\b(rest|remaining)\b/.test(text) && /\bno pass|no passes\b/.test(text)) {
    result.noPassCount = Math.max(0, groupSize - assigned);
  } else if (assigned < groupSize && /\bhalf\b/.test(text)) {
    result.noPassCount = Math.max(0, groupSize - assigned);
  }

  if (assigned >= groupSize) {
    normalizePassCountTotals(result, groupSize);
  }
  return result;
}

function inferCountNearToken(text: string, tokenLabel: string, groupSize: number): number | null {
  const directNumberBefore = new RegExp(`(\\d+)\\s+(?:of\\s+the\\s+group\\s+)?(?:have\\s+)?${escapeRegExp(tokenLabel)}`, "i");
  const directNumberAfter = new RegExp(`${escapeRegExp(tokenLabel)}(?:\\s+passes?)?.{0,24}?(\\d+)`, "i");
  const halfPattern = new RegExp(`(?:half|1\\/2)\\s+(?:of\\s+the\\s+group\\s+)?(?:has|have)?\\s*${escapeRegExp(tokenLabel)}`, "i");
  const everyonePattern = new RegExp(`(?:everyone|all|entire group).{0,16}${escapeRegExp(tokenLabel)}`, "i");

  if (everyonePattern.test(text)) return groupSize;
  if (halfPattern.test(text)) return Math.round(groupSize / 2);

  const before = text.match(directNumberBefore);
  if (before) return clampCount(Number(before[1]), groupSize);

  const after = text.match(directNumberAfter);
  if (after) return clampCount(Number(after[1]), groupSize);

  return null;
}

function normalizePassCountTotals(
  counts: {
    ikonCount?: number;
    epicCount?: number;
    indyCount?: number;
    mountainCollectiveCount?: number;
    noPassCount?: number;
  },
  groupSize: number
): void {
  const keys: Array<keyof typeof counts> = [
    "ikonCount",
    "epicCount",
    "indyCount",
    "mountainCollectiveCount",
    "noPassCount"
  ];
  let total = keys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  if (total <= groupSize) return;

  for (let index = keys.length - 1; index >= 0 && total > groupSize; index -= 1) {
    const key = keys[index];
    const current = counts[key] ?? 0;
    if (current <= 0) continue;
    const next = Math.max(0, current - (total - groupSize));
    counts[key] = next;
    total = keys.reduce((sum, itemKey) => sum + (counts[itemKey] ?? 0), 0);
  }
}

function clampCount(value: number, groupSize: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(groupSize, Math.round(value)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function needsTravelerPods(spec: TripSpec): boolean {
  return Boolean(
    spec.travel.noFlying ||
      typeof spec.travel.maxDriveHours === "number"
  );
}

export function determineMissingFields(spec: TripSpec): string[] {
  const missing: string[] = [];

  if (!isResolvedDateRange(spec.dates.start, spec.dates.end)) {
    missing.push("dates");
  }
  if (!spec.group.size) {
    missing.push("group_size");
  }
  if (!spec.group.skillLevels || spec.group.skillLevels.length === 0) {
    missing.push("skill_levels");
  }
  if (!isGearResolved(spec.gear)) {
    missing.push("gear_rental");
  }
  if (!spec.budget.confirmed) {
    missing.push("budget");
  }
  if (!isPassesResolved(spec.notes.passes, spec.group.size)) {
    missing.push("passes");
  }
  if (!spec.travel.confirmed) {
    missing.push("travel_restrictions");
  }
  if (!spec.location.confirmed) {
    missing.push("location_input");
  }
  if (needsTravelerPods(spec) && (!spec.travelers.pods || spec.travelers.pods.length === 0)) {
    missing.push("traveler_pods");
  }
  if (spec.lodgingConstraints.constraintMode === "hard" && spec.lodgingConstraints.confirmed !== true) {
    missing.push("lodging_constraints");
  }
  if (spec.diningConstraints.constraintMode === "hard" && spec.diningConstraints.confirmed !== true) {
    missing.push("dining_constraints");
  }

  return missing;
}

function isGearResolved(gear: TripSpec["gear"]): boolean {
  if (gear.confirmed) return true;
  if (gear.rentalRequired !== undefined) return true;
  if (typeof gear.rentalCount === "number") return true;
  if (typeof gear.rentalShare === "number") return true;
  if (Boolean(gear.rentalNotes)) return true;
  return false;
}

function isResolvedDateRange(start?: string, end?: string): boolean {
  if (!start || !end) return false;
  const startDate = dayjs(start);
  const endDate = dayjs(end);
  return startDate.isValid() && endDate.isValid();
}

function isPassesResolved(passes: PassOwnership | undefined, groupSize: number | undefined): boolean {
  if (!passes) return false;
  if (passes.confirmed) return true;

  const holderSum =
    (passes.ikonCount ?? 0) +
    (passes.epicCount ?? 0) +
    (passes.indyCount ?? 0) +
    (passes.mountainCollectiveCount ?? 0) +
    (passes.noPassCount ?? 0);
  if (groupSize && holderSum >= groupSize) return true;

  if (
    typeof passes.ikonCount === "number" ||
    typeof passes.epicCount === "number" ||
    typeof passes.indyCount === "number" ||
    typeof passes.mountainCollectiveCount === "number" ||
    typeof passes.noPassCount === "number"
  ) {
    return true;
  }

  if (Array.isArray(passes.otherPasses) && passes.otherPasses.length > 0) return true;
  if (passes.notes) return true;
  return false;
}
