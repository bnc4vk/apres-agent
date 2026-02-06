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
    notes: z.string().optional()
  }),
  gear: z.object({
    rentalRequired: z.boolean().optional(),
    rentalCount: z.number().int().positive().optional(),
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

export type TripSpecPatch = Partial<Omit<TripSpec, "id" | "createdAt" | "status">>;

export const TripSpecPatchSchema = z
  .object({
    group: TripSpecSchema.shape.group.partial().optional(),
    gear: TripSpecSchema.shape.gear.partial().optional(),
    budget: TripSpecSchema.shape.budget.partial().optional(),
    travel: TripSpecSchema.shape.travel.partial().optional(),
    dates: TripSpecSchema.shape.dates.partial().optional(),
    location: TripSpecSchema.shape.location.partial().optional(),
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
    gear: {},
    budget: {},
    travel: {},
    dates: {},
    location: {},
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
    gear: { ...spec.gear, ...patch.gear },
    budget: { ...spec.budget, ...patch.budget },
    travel: { ...spec.travel, ...patch.travel },
    dates: { ...spec.dates, ...patch.dates },
    location: { ...spec.location, ...patch.location },
    travelers: { ...spec.travelers, ...patch.travelers },
    notes: { ...spec.notes, ...patch.notes },
    status: spec.status
  };
  merged.updatedAt = new Date().toISOString();
  return updateTripSpecStatus(merged);
}

export function updateTripSpecStatus(spec: TripSpec): TripSpec {
  const missingFields = determineMissingFields(spec);
  return {
    ...spec,
    status: {
      readyToGenerate: missingFields.length === 0,
      missingFields
    }
  };
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
