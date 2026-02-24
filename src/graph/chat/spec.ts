import { TripSpec, TripSpecPatch, updateTripSpecStatus } from "../../core/tripSpec";

export function detectIssue(spec: TripSpec): string | null {
  if (spec.dates.start && spec.dates.end && spec.dates.start > spec.dates.end) {
    return "I noticed the end date is before the start date. Could you confirm the correct date range?";
  }
  if (spec.travel.noFlying === true && spec.travel.arrivalAirport) {
    return `You mentioned no flying but also arriving via ${spec.travel.arrivalAirport}. Should I assume flying is okay?`;
  }
  return null;
}

export function autoConfirm(spec: TripSpec): TripSpec {
  const updated = { ...spec };

  const gearProvided =
    updated.gear.rentalRequired !== undefined ||
    typeof updated.gear.rentalCount === "number" ||
    typeof updated.gear.rentalShare === "number" ||
    Boolean(updated.gear.rentalNotes);
  if (typeof updated.gear.rentalCount === "number" && updated.gear.rentalRequired === undefined) {
    updated.gear = { ...updated.gear, rentalRequired: updated.gear.rentalCount > 0 };
  }
  if (gearProvided && updated.gear.confirmed !== true) {
    updated.gear = { ...updated.gear, confirmed: true };
  }

  if (
    (updated.budget.band || updated.budget.perPersonMax || updated.budget.totalMax) &&
    updated.budget.confirmed !== true
  ) {
    updated.budget = { ...updated.budget, confirmed: true };
  }

  const locationProvided = Boolean(
    updated.location.resort ||
      updated.location.region ||
      updated.location.state ||
      updated.location.openToSuggestions
  );
  if (locationProvided && updated.location.confirmed !== true) {
    updated.location = { ...updated.location, confirmed: true };
  }

  const travelProvided =
    typeof updated.travel.noFlying === "boolean" ||
    typeof updated.travel.maxDriveHours === "number" ||
    Boolean(updated.travel.restrictions?.length) ||
    Boolean(updated.travel.arrivalAirport) ||
    typeof updated.travel.canFlyCount === "number" ||
    typeof updated.travel.cannotFlyCount === "number";
  if (travelProvided && updated.travel.confirmed !== true) {
    updated.travel = { ...updated.travel, confirmed: true };
  }

  const passes = updated.notes.passes;
  const passesProvided = Boolean(
    passes &&
      (typeof passes.ikonCount === "number" ||
        typeof passes.epicCount === "number" ||
        typeof passes.indyCount === "number" ||
        typeof passes.mountainCollectiveCount === "number" ||
        typeof passes.noPassCount === "number" ||
        (Array.isArray(passes.otherPasses) && passes.otherPasses.length > 0) ||
        Boolean(passes.notes))
  );
  if (passes && passesProvided && passes.confirmed !== true) {
    updated.notes = { ...updated.notes, passes: { ...passes, confirmed: true } };
  }

  const lodgingProvided = Boolean(
    typeof updated.lodgingConstraints.maxWalkMinutesToLift === "number" ||
      typeof updated.lodgingConstraints.hotTubRequired === "boolean" ||
      typeof updated.lodgingConstraints.laundryRequired === "boolean" ||
      typeof updated.lodgingConstraints.minBedrooms === "number" ||
      typeof updated.lodgingConstraints.kitchenRequired === "boolean"
  );
  if (lodgingProvided && updated.lodgingConstraints.confirmed !== true) {
    updated.lodgingConstraints = {
      ...updated.lodgingConstraints,
      confirmed: true
    };
  }

  const diningProvided = Boolean(
    typeof updated.diningConstraints.mustSupportTakeout === "boolean" ||
      typeof updated.diningConstraints.minGroupCapacity === "number" ||
      typeof updated.diningConstraints.mustBeReservable === "boolean"
  );
  if (diningProvided && updated.diningConstraints.confirmed !== true) {
    updated.diningConstraints = {
      ...updated.diningConstraints,
      confirmed: true
    };
  }

  const organizerOpsProvided =
    typeof updated.organizerOps.wantsGroupChatSetup === "boolean" ||
    typeof updated.organizerOps.wantsSplitwiseSetup === "boolean";
  if (organizerOpsProvided && updated.organizerOps.confirmed !== true) {
    updated.organizerOps = { ...updated.organizerOps, confirmed: true };
  }

  return updateTripSpecStatus(updated);
}

export function deriveHeuristicPatchFromUserMessage(message: string, spec: TripSpec): TripSpecPatch {
  const text = (message || "").toLowerCase();
  if (!text.trim()) return {};

  const patch: TripSpecPatch = {};

  const stateMatch = inferState(text);
  if (stateMatch) {
    patch.location = {
      ...(patch.location ?? {}),
      state: stateMatch,
      confirmed: true
    };
  }

  const regionMatch = inferRegion(text);
  if (regionMatch) {
    patch.location = {
      ...(patch.location ?? {}),
      region: regionMatch,
      confirmed: true
    };
  }

  if (/\bno travel restrictions?\b/.test(text) || /\bno restrictions?\b/.test(text)) {
    patch.travel = {
      ...(patch.travel ?? {}),
      noFlying: false,
      restrictions: [],
      confirmed: true
    };
  }

  if (/\bepic\b|\bikon\b|\bindy\b|\bmountain collective\b/.test(text)) {
    const groupSize = spec.group.size;
    const inferredPasses = inferPassPatch(text, groupSize);
    patch.notes = {
      ...(patch.notes ?? {}),
      passes: {
        ...(patch.notes?.passes ?? {}),
        ...(inferredPasses ?? {}),
        notes: message,
        confirmed: true
      }
    };
  }

  return patch;
}

function inferState(text: string): string | null {
  if (/\bcolorado\b|\bco\b/.test(text)) return "Colorado";
  if (/\butah\b|\but\b/.test(text)) return "Utah";
  if (/\bcalifornia\b|\bca\b/.test(text)) return "California";
  if (/\bwyoming\b|\bwy\b/.test(text)) return "Wyoming";
  if (/\bmontana\b|\bmt\b/.test(text)) return "Montana";
  return null;
}

function inferRegion(text: string): string | null {
  if (/\btahoe\b/.test(text)) return "Tahoe";
  if (/\bwasatch\b/.test(text)) return "Wasatch";
  if (/\bsummit county\b/.test(text)) return "Summit County";
  return null;
}

function inferPassPatch(
  text: string,
  groupSize: number | undefined
):
  | {
      ikonCount?: number;
      epicCount?: number;
      indyCount?: number;
      mountainCollectiveCount?: number;
      noPassCount?: number;
    }
  | null {
  if (!groupSize || groupSize <= 0) {
    return null;
  }

  const result: {
    ikonCount?: number;
    epicCount?: number;
    indyCount?: number;
    mountainCollectiveCount?: number;
    noPassCount?: number;
  } = {};

  const programs: Array<{ key: keyof typeof result; token: string }> = [
    { key: "epicCount", token: "epic" },
    { key: "ikonCount", token: "ikon" },
    { key: "indyCount", token: "indy" },
    { key: "mountainCollectiveCount", token: "mountain collective" }
  ];

  let assigned = 0;
  for (const program of programs) {
    if (!text.includes(program.token)) continue;
    const count = inferCountForToken(text, program.token, groupSize);
    if (typeof count === "number") {
      result[program.key] = count;
      assigned += count;
    }
  }

  if (/\bno one\b.*\b(pass|passes)\b/.test(text) || /\bnobody\b.*\b(pass|passes)\b/.test(text)) {
    result.noPassCount = groupSize;
    return result;
  }

  if (assigned > 0 && /\bhalf\b/.test(text) && assigned < groupSize) {
    result.noPassCount = Math.max(0, groupSize - assigned);
  } else if (assigned > 0 && /\b(rest|remaining)\b/.test(text) && /\bno pass/.test(text)) {
    result.noPassCount = Math.max(0, groupSize - assigned);
  }

  return Object.keys(result).length > 0 ? result : null;
}

function inferCountForToken(text: string, token: string, groupSize: number): number | null {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const halfPattern = new RegExp(`(?:half|1\\/2)\\s+(?:the\\s+group\\s+)?(?:has|have)?\\s*${escaped}`, "i");
  if (halfPattern.test(text)) return Math.round(groupSize / 2);

  const allPattern = new RegExp(`(?:everyone|all|entire group).{0,20}${escaped}`, "i");
  if (allPattern.test(text)) return groupSize;

  const before = text.match(new RegExp(`(\\d+)\\s+(?:people\\s+)?(?:have\\s+)?${escaped}`, "i"));
  if (before) return Math.max(0, Math.min(groupSize, Number(before[1])));

  const after = text.match(new RegExp(`${escaped}(?:\\s+passes?)?.{0,24}?(\\d+)`, "i"));
  if (after) return Math.max(0, Math.min(groupSize, Number(after[1])));

  return null;
}
