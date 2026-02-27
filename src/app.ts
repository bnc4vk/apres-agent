import "dotenv/config";
import express from "express";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

export type TripIntakePayload = {
  startDate: string;
  endDate: string;
  destinationPreference?: string;
  openToSuggestions?: boolean;
  groupSize: number;
  groupRiderMix?: string;
  skillLevels: string[];
  budgetPerPerson: number;
  passPreset?: string;
  passBreakdown?: string;
  travelMode?: string;
  maxDriveHours?: number | null;
  lodgingStylePreference?: string;
  minBedrooms?: number | null;
  maxWalkMinutes?: number | null;
  hotTubRequired?: boolean;
  kitchenRequired?: boolean;
  laundryRequired?: boolean;
  rentalRequired?: string;
  rentalCount?: number | null;
  rentalType?: string;
};

type StoredResult = {
  id: string;
  createdAt: string;
  prompt: string;
  response: string;
  model: string;
};

const results = new Map<string, StoredResult>();
const RESULT_LIMIT = 100;

export const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/results/:id", (_req, res) => {
  res.sendFile(path.join(publicDir, "results.html"));
});

app.post("/api/generate-itinerary", async (req, res) => {
  try {
    const details = validateTripIntake(req.body);
    const prompt = composePrompt(details);
    const { text, model } = await requestChatGpt(prompt);

    const id = randomUUID();
    const record: StoredResult = {
      id,
      createdAt: new Date().toISOString(),
      prompt,
      response: text,
      model
    };
    results.set(id, record);
    trimResults();

    res.json({ resultId: id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate itinerary.";
    console.error(error);
    res.status(400).json({ error: message });
  }
});

app.get("/api/results/:id", (req, res) => {
  const record = results.get(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Result not found." });
    return;
  }
  res.json(record);
});

function validateTripIntake(value: unknown): TripIntakePayload {
  const body = (value ?? {}) as Record<string, unknown>;
  const startDate = stringField(body.startDate);
  const endDate = stringField(body.endDate);
  const groupSize = numberField(body.groupSize);
  const budgetPerPerson = numberField(body.budgetPerPerson);
  const skillLevels = arrayOfStrings(body.skillLevels);

  if (!startDate || !endDate) throw new Error("Start date and end date are required.");
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) throw new Error("Dates must be valid YYYY-MM-DD values.");
  if (groupSize < 1) throw new Error("Group size must be at least 1.");
  if (budgetPerPerson < 1) throw new Error("Budget per person must be at least 1.");
  if (skillLevels.length === 0) throw new Error("Select at least one skill level.");

  return {
    startDate,
    endDate,
    destinationPreference: optionalString(body.destinationPreference),
    openToSuggestions: Boolean(body.openToSuggestions),
    groupSize,
    groupRiderMix: optionalString(body.groupRiderMix),
    skillLevels,
    budgetPerPerson,
    passPreset: optionalString(body.passPreset),
    passBreakdown: optionalString(body.passBreakdown),
    travelMode: optionalString(body.travelMode),
    maxDriveHours: optionalNumber(body.maxDriveHours),
    lodgingStylePreference: optionalString(body.lodgingStylePreference),
    minBedrooms: optionalNumber(body.minBedrooms),
    maxWalkMinutes: optionalNumber(body.maxWalkMinutes),
    hotTubRequired: Boolean(body.hotTubRequired),
    kitchenRequired: Boolean(body.kitchenRequired),
    laundryRequired: Boolean(body.laundryRequired),
    rentalRequired: optionalString(body.rentalRequired),
    rentalCount: optionalNumber(body.rentalCount),
    rentalType: optionalString(body.rentalType)
  };
}

export function composePrompt(details: TripIntakePayload): string {
  const lines: string[] = [];
  lines.push("i am planning a ski trip for a group, here are the details:");
  lines.push("");
  lines.push(`- ${formatDateRange(details.startDate, details.endDate)}`);
  lines.push(`- total of ${details.groupSize} people`);

  if (details.destinationPreference) {
    lines.push(`- a resort in ${details.destinationPreference}`);
  } else if (details.openToSuggestions) {
    lines.push("- we are open to destination suggestions");
  }

  const passLine = describePasses(details);
  if (passLine) lines.push(`- ${passLine}`);

  const riderMixLine = describeRiderMix(details.groupRiderMix);
  if (riderMixLine) lines.push(`- ${riderMixLine}`);

  const rentalLine = describeGearRental(details);
  if (rentalLine) lines.push(`- ${rentalLine}`);

  const lodgingLine = describeLodging(details);
  if (lodgingLine) lines.push(`- ${lodgingLine}`);

  const travelLine = describeTravel(details);
  if (travelLine) lines.push(`- ${travelLine}`);

  const amenityLine = describeAmenities(details);
  if (amenityLine) lines.push(`- ${amenityLine}`);

  lines.push(`- we're ${formatSkillLevels(details.skillLevels)} in skill level`);
  lines.push(`- we don't want to spend more than $${Math.round(details.budgetPerPerson)} per person for everything all included`);

  lines.push("");
  lines.push(
    "can you produce a few candidate itineraries for this group? please include links to the housing, car rental, and gear shop. format the answer as exactly three sections titled 'Itinerary A', 'Itinerary B', and 'Itinerary C', and for each itinerary include: Why this works, Home, Ski/Ride plan, Parking/reservations, Gear rental, Car rental, and Budget note."
  );

  return lines.join("\n");
}

async function requestChatGpt(prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: prompt
    })
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const apiMessage =
      typeof (data as { error?: { message?: unknown } }).error?.message === "string"
        ? ((data as { error: { message: string } }).error.message)
        : `OpenAI request failed (${response.status}).`;
    throw new Error(apiMessage);
  }

  const text = extractResponseText(data);
  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }
  return { text, model };
}

function extractResponseText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const output = Array.isArray(data.output) ? data.output : [];
  const parts: string[] = [];

  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
    for (const chunk of content) {
      const text =
        typeof (chunk as { text?: unknown }).text === "string"
          ? ((chunk as { text: string }).text)
          : null;
      if (text) parts.push(text);
    }
  }

  return parts.join("\n").trim();
}

function trimResults(): void {
  if (results.size <= RESULT_LIMIT) return;
  const ids = [...results.keys()];
  while (ids.length > RESULT_LIMIT) {
    const oldest = ids.shift();
    if (oldest) results.delete(oldest);
  }
}

function stringField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  const parsed = stringField(value);
  return parsed || undefined;
}

function numberField(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startIso} - ${endIso}`;
  }

  const startMonth = monthName(start);
  const endMonth = monthName(end);
  const startDay = ordinal(start.getDate());
  const endDay = ordinal(end.getDate());

  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${startMonth} ${startDay} - ${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

function monthName(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
}

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

function describePasses(details: TripIntakePayload): string | null {
  if (details.passPreset === "ikon") return "most of the group has ikon";
  if (details.passPreset === "epic") return "most of the group has epic";
  if (details.passPreset === "none") return "nobody has a lift pass";
  if (details.passPreset === "explicit_breakdown" && details.passBreakdown) {
    return `pass breakdown: ${details.passBreakdown}`;
  }
  return null;
}

function describeRiderMix(value?: string): string | null {
  if (value === "hybrid") return "half the group is snowboarding and the other half skiing";
  if (value === "skiers") return "everyone is skiing";
  if (value === "snowboarders") return "everyone is snowboarding";
  return null;
}

function describeGearRental(details: TripIntakePayload): string | null {
  if (details.rentalRequired === "no") return "nobody needs gear rental";
  if (details.rentalRequired === "yes") {
    const count = details.rentalCount ? `${details.rentalCount} people need` : "some people need";
    if (details.rentalType === "skiers") return `${count} ski gear rental`;
    if (details.rentalType === "snowboarders") return `${count} snowboard gear rental`;
    if (details.rentalType === "both") return `some snowboarders and some skiers need gear rental`;
    return `${count} gear rental`;
  }
  if (details.rentalCount) return `${details.rentalCount} people may need gear rental`;
  return null;
}

function describeLodging(details: TripIntakePayload): string | null {
  const parts: string[] = [];

  if (details.lodgingStylePreference === "shared_house") {
    parts.push("we'd like to all stay together in one larger home");
  } else if (details.lodgingStylePreference === "separate_rooms") {
    parts.push("we'd prefer separate rooms in a lodge or hotel");
  } else if (details.lodgingStylePreference === "flexible") {
    parts.push("we're flexible on lodging style");
  }

  if (details.minBedrooms) {
    parts.push(`we need at least ${details.minBedrooms} bedrooms`);
  }

  if (details.maxWalkMinutes) {
    parts.push(`max ${details.maxWalkMinutes} minute walk to the lift if possible`);
  }

  return parts.length > 0 ? parts.join(" and ") : null;
}

function describeTravel(details: TripIntakePayload): string | null {
  if (details.travelMode === "drive_only") {
    return details.maxDriveHours
      ? `we are driving only (max ${details.maxDriveHours} hours)`
      : "we are driving only";
  }
  if (details.travelMode === "mixed_driver_required") {
    return "we need car rentals and at least one person must drive";
  }
  if (details.travelMode === "flexible") {
    return details.maxDriveHours
      ? `we can fly or drive (targeting up to ${details.maxDriveHours} drive hours)`
      : "we can fly or drive and may need car rentals";
  }
  return "we need car rentals";
}

function describeAmenities(details: TripIntakePayload): string | null {
  const wants: string[] = [];
  if (details.hotTubRequired) wants.push("hot tub");
  if (details.kitchenRequired) wants.push("kitchen");
  if (details.laundryRequired) wants.push("laundry");
  if (wants.length === 0) return null;
  return `we want a home with ${joinNatural(wants)}`;
}

function formatSkillLevels(levels: string[]): string {
  const normalized = levels.map((level) => {
    if (level === "beginner") return "beginner";
    if (level === "intermediate") return "intermediate";
    if (level === "advanced") return "advanced";
    if (level === "expert") return "expert";
    return level;
  });
  return joinNatural(normalized);
}

function joinNatural(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
