import dayjs from "dayjs";
import { ChatMessage } from "../../llm/types";
import { PendingSpecAssumption, TripSpec, TripSpecPatch } from "../../core/tripSpec";

export function shouldOfferAssumptionMode(messages: ChatMessage[], missingFields: string[]): boolean {
  if (missingFields.length === 0) return false;
  const userTurns = messages.filter((message) => message.role === "user").length;
  if (userTurns < 3) return false;

  const alreadyOffered = messages.some(
    (message) =>
      message.role === "assistant" &&
      message.content.includes("I can generate itineraries now with assumptions")
  );
  return !alreadyOffered;
}

export function shouldForceGenerate(userMessage: string, missingFields: string[]): boolean {
  if (missingFields.length === 0) return false;
  return /\b(proceed|go ahead|generate now|run with assumptions|use assumptions|continue with assumptions)\b/i.test(
    userMessage
  );
}

export function buildAssumptionOffer(pending: PendingSpecAssumption[]): string {
  const assumptions = pending.map((item) => `- ${item.label}: ${item.assumption}`).join("\n");
  return [
    "I can generate itineraries now with assumptions, or we can keep refining inputs.",
    "If we proceed now, I’ll assume:",
    assumptions,
    "Reply with details for any item above, or say “proceed with assumptions” to generate now."
  ].join("\n");
}

export function buildGenerationNote(missingFields: string[]): string {
  const labels = missingFields.map(fieldLabel).join(", ");
  return `Proceeding with itinerary generation using assumptions for: ${labels}.`;
}

export function createPendingAssumptions(
  missingFields: string[],
  existing: PendingSpecAssumption[] = []
): PendingSpecAssumption[] {
  const now = new Date().toISOString();
  const byField = new Map(existing.map((item) => [item.field, item]));
  for (const field of missingFields) {
    if (byField.has(field)) continue;
    byField.set(field, {
      id: field,
      field,
      label: fieldLabel(field),
      assumption: assumptionLabel(field),
      createdAt: now
    });
  }
  return [...byField.values()];
}

export function syncPendingAssumptions(
  pending: PendingSpecAssumption[],
  missingFields: string[]
): PendingSpecAssumption[] {
  const missing = new Set(missingFields);
  return pending.filter((item) => missing.has(item.field));
}

export function buildAssumptionPatch(spec: TripSpec, missingFields: string[]): TripSpecPatch {
  const patch: TripSpecPatch = {};
  const missing = new Set(missingFields);

  if (missing.has("group_size")) {
    patch.group = { ...(patch.group ?? {}), size: 4 };
  }
  if (missing.has("skill_levels")) {
    patch.group = { ...(patch.group ?? {}), skillLevels: ["intermediate"] };
  }
  if (missing.has("dates")) {
    const nextWeekend = nextFridayWindow();
    patch.dates = {
      start: nextWeekend.start,
      end: nextWeekend.end,
      kind: "window",
      weekendsPreferred: true,
      yearConfirmed: true
    };
  }
  if (missing.has("gear_rental")) {
    patch.gear = { rentalRequired: false, confirmed: true };
  }
  if (missing.has("budget")) {
    patch.budget = {
      band: "mid",
      perPersonMax: 1500,
      currency: "USD",
      confirmed: true
    };
  }
  if (missing.has("passes")) {
    const groupSize = patch.group?.size ?? spec.group.size ?? 4;
    patch.notes = {
      ...(patch.notes ?? {}),
      passes: {
        noPassCount: groupSize,
        notes: "Assumed no season pass details were provided.",
        confirmed: true
      }
    };
  }
  if (missing.has("travel_restrictions")) {
    patch.travel = {
      ...(patch.travel ?? {}),
      noFlying: false,
      confirmed: true
    };
  }
  if (missing.has("location_input")) {
    patch.location = {
      openToSuggestions: true,
      confirmed: true
    };
  }
  if (missing.has("traveler_pods")) {
    const groupSize = patch.group?.size ?? spec.group.size ?? 4;
    patch.travelers = { pods: [{ origin: "mixed origins", count: groupSize }] };
  }
  if (missing.has("lodging_constraints")) {
    patch.lodgingConstraints = {
      maxWalkMinutesToLift: 15,
      hotTubRequired: false,
      laundryRequired: false,
      kitchenRequired: false,
      constraintMode: "soft",
      confirmed: true
    };
  }
  if (missing.has("dining_constraints")) {
    patch.diningConstraints = {
      mustSupportTakeout: true,
      minGroupCapacity: 8,
      constraintMode: "soft",
      confirmed: true
    };
  }

  return patch;
}

function nextFridayWindow(): { start: string; end: string } {
  let cursor = dayjs().add(1, "month").startOf("month");
  while (cursor.day() !== 5) {
    cursor = cursor.add(1, "day");
  }
  return {
    start: cursor.format("YYYY-MM-DD"),
    end: cursor.add(2, "day").format("YYYY-MM-DD")
  };
}

export function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    dates: "Dates",
    group_size: "Group size",
    skill_levels: "Skill levels",
    gear_rental: "Gear rentals",
    budget: "Budget",
    passes: "Pass ownership",
    travel_restrictions: "Travel restrictions",
    location_input: "Location preference",
    traveler_pods: "Departure locations",
    lodging_constraints: "Lodging constraints",
    dining_constraints: "Dining constraints"
  };
  return labels[field] ?? field;
}

export function assumptionLabel(field: string): string {
  const assumptions: Record<string, string> = {
    dates: "A near-term weekend window.",
    group_size: "4 travelers.",
    skill_levels: "Mostly intermediate skiers.",
    gear_rental: "No rentals required.",
    budget: "$1,500 per person total.",
    passes: "No one currently holds Ikon/Epic/Indy pass coverage.",
    travel_restrictions: "Flying allowed with no hard restriction.",
    location_input: "Open to the best-fit resort suggestions.",
    traveler_pods: "A single mixed-origin travel pod.",
    lodging_constraints: "Soft lodging constraints with flexible amenities.",
    dining_constraints: "Takeout preferred with flexible seating constraints."
  };
  return assumptions[field] ?? "Reasonable defaults.";
}
