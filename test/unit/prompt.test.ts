import test from "node:test";
import assert from "node:assert/strict";
import { composePrompt, type TripIntakePayload } from "../../src/app";

function makePayload(overrides: Partial<TripIntakePayload> = {}): TripIntakePayload {
  return {
    startDate: "2026-03-13",
    endDate: "2026-03-15",
    destinationPreference: "Utah",
    openToSuggestions: false,
    groupSize: 8,
    groupRiderMix: "hybrid",
    skillLevels: ["intermediate", "advanced"],
    budgetPerPerson: 1500,
    passPreset: "ikon",
    passBreakdown: "",
    travelMode: "flexible",
    maxDriveHours: null,
    lodgingStylePreference: "shared_house",
    minBedrooms: 4,
    maxWalkMinutes: 15,
    hotTubRequired: true,
    kitchenRequired: true,
    laundryRequired: false,
    rentalRequired: "yes",
    rentalCount: 4,
    rentalType: "both",
    ...overrides
  };
}

test("composePrompt includes the structured itinerary format contract", () => {
  const prompt = composePrompt(makePayload());
  assert.match(prompt, /Itinerary A/i);
  assert.match(prompt, /Itinerary B/i);
  assert.match(prompt, /Itinerary C/i);
  assert.match(prompt, /short descriptive name/i);
  assert.match(prompt, /Why this works:/i);
  assert.match(prompt, /Budget snapshot:/i);
  assert.match(prompt, /Stay \+ mountain access:/i);
  assert.match(prompt, /Ski\/Ride plan:/i);
  assert.match(prompt, /Transport \+ reservations:/i);
  assert.match(prompt, /Gear rental:/i);
  assert.match(prompt, /Watchouts:/i);
});

test("composePrompt does not request google sheet generation", () => {
  const prompt = composePrompt(makePayload());
  assert.doesNotMatch(prompt.toLowerCase(), /google sheet|one-click/i);
});

test("composePrompt includes structured trip details and extensibility guidance", () => {
  const prompt = composePrompt(makePayload());
  assert.match(prompt, /Constraints:/i);
  assert.match(prompt, /dates\s+2026-03-13 to 2026-03-15/i);
  assert.match(prompt, /group\s+8/i);
  assert.match(prompt, /budget_pp_usd_max\s+1500/i);
  assert.match(prompt, /New keys may appear/i);
});
