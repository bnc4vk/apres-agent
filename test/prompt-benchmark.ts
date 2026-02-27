import "dotenv/config";
import fs from "fs";
import path from "path";
import { composePrompt, type TripIntakePayload } from "../src/app";

type PromptVariant = {
  id: "legacy" | "optimized";
  compose: (details: TripIntakePayload) => string;
};

type Scenario = {
  id: string;
  title: string;
  payload: TripIntakePayload;
};

type Sample = {
  variant: PromptVariant["id"];
  scenarioId: string;
  run: number;
  latencyMs: number;
  promptChars: number;
  responseChars: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  ok: boolean;
  error?: string;
};

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to run prompt benchmark.");
}

const model = process.env.OPENAI_MODEL || "gpt-5.2";
const repeats = Math.max(1, Number(process.env.PROMPT_BENCH_REPEATS || "2"));

const scenarios: Scenario[] = [
  {
    id: "utah-ikon-8",
    title: "Utah Ikon hybrid group",
    payload: {
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
      rentalType: "both"
    }
  },
  {
    id: "tahoe-drive-5",
    title: "Tahoe drive budget group",
    payload: {
      startDate: "2026-04-10",
      endDate: "2026-04-12",
      destinationPreference: "Lake Tahoe",
      openToSuggestions: false,
      groupSize: 5,
      groupRiderMix: "snowboarders",
      skillLevels: ["beginner", "intermediate"],
      budgetPerPerson: 900,
      passPreset: "none",
      passBreakdown: "",
      travelMode: "drive_only",
      maxDriveHours: 6,
      lodgingStylePreference: "separate_rooms",
      minBedrooms: 2,
      maxWalkMinutes: null,
      hotTubRequired: false,
      kitchenRequired: true,
      laundryRequired: true,
      rentalRequired: "yes",
      rentalCount: 3,
      rentalType: "snowboarders"
    }
  },
  {
    id: "open-suggestions-10",
    title: "Open suggestions mixed skill larger group",
    payload: {
      startDate: "2026-02-20",
      endDate: "2026-02-24",
      destinationPreference: "",
      openToSuggestions: true,
      groupSize: 10,
      groupRiderMix: "hybrid",
      skillLevels: ["beginner", "intermediate", "advanced"],
      budgetPerPerson: 1200,
      passPreset: "explicit_breakdown",
      passBreakdown: "6 have Ikon, 2 have Epic, 2 have no pass",
      travelMode: "mixed_driver_required",
      maxDriveHours: null,
      lodgingStylePreference: "shared_house",
      minBedrooms: 5,
      maxWalkMinutes: 10,
      hotTubRequired: true,
      kitchenRequired: true,
      laundryRequired: true,
      rentalRequired: "yes",
      rentalCount: 5,
      rentalType: "both"
    }
  }
];

const variants: PromptVariant[] = [
  { id: "legacy", compose: composeLegacyPrompt },
  { id: "optimized", compose: composePrompt }
];

const samples: Sample[] = [];

for (const scenario of scenarios) {
  for (const variant of variants) {
    for (let run = 1; run <= repeats; run += 1) {
      const prompt = variant.compose(scenario.payload);
      const started = Date.now();
      try {
        const data = await requestResponse(prompt);
        const text = extractResponseText(data);
        const usage = extractUsage(data);
        const sample: Sample = {
          variant: variant.id,
          scenarioId: scenario.id,
          run,
          latencyMs: Date.now() - started,
          promptChars: prompt.length,
          responseChars: text.length,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          ok: true
        };
        samples.push(sample);
        process.stdout.write(
          `${scenario.id} ${variant.id} run ${run}/${repeats}: ${sample.latencyMs}ms, in=${sample.inputTokens}, out=${sample.outputTokens}\n`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        samples.push({
          variant: variant.id,
          scenarioId: scenario.id,
          run,
          latencyMs: Date.now() - started,
          promptChars: prompt.length,
          responseChars: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          ok: false,
          error: message
        });
        process.stdout.write(`${scenario.id} ${variant.id} run ${run}/${repeats}: ERROR ${message}\n`);
      }
    }
  }
}

const metrics = summarize(samples);
const artifact = {
  createdAt: new Date().toISOString(),
  model,
  repeats,
  scenarios: scenarios.map((s) => ({ id: s.id, title: s.title })),
  metrics,
  samples
};

const artifactDir = path.join(process.cwd(), "tmp", "prompt-benchmark");
fs.mkdirSync(artifactDir, { recursive: true });
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = path.join(artifactDir, `${runId}.json`);
fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2));

console.log(JSON.stringify({ outputPath, metrics }, null, 2));

async function requestResponse(prompt: string): Promise<Record<string, unknown>> {
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
  return data;
}

function extractUsage(data: Record<string, unknown>): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const usage = (data as { usage?: Record<string, unknown> }).usage || {};
  const inputTokens = asNumber(usage.input_tokens) ?? asNumber(usage.prompt_tokens) ?? 0;
  const outputTokens = asNumber(usage.output_tokens) ?? asNumber(usage.completion_tokens) ?? 0;
  const totalTokens = asNumber(usage.total_tokens) ?? inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
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
      const text = typeof (chunk as { text?: unknown }).text === "string" ? ((chunk as { text: string }).text) : "";
      if (text) parts.push(text);
    }
  }
  return parts.join("\n").trim();
}

function summarize(samples: Sample[]): Record<string, unknown> {
  const byVariant = Object.fromEntries(
    variants.map((variant) => {
      const rows = samples.filter((sample) => sample.variant === variant.id && sample.ok);
      return [variant.id, summarizeRows(rows)];
    })
  );

  const legacy = byVariant.legacy as Record<string, number> | undefined;
  const optimized = byVariant.optimized as Record<string, number> | undefined;
  const delta = legacy && optimized ? summarizeDelta(legacy, optimized) : {};

  const failures = samples.filter((sample) => !sample.ok);
  return {
    byVariant,
    deltaOptimizedVsLegacy: delta,
    failureCount: failures.length,
    failures
  };
}

function summarizeRows(rows: Sample[]): Record<string, number> {
  return {
    runs: rows.length,
    avgLatencyMs: mean(rows.map((row) => row.latencyMs)),
    medianLatencyMs: median(rows.map((row) => row.latencyMs)),
    avgPromptChars: mean(rows.map((row) => row.promptChars)),
    avgResponseChars: mean(rows.map((row) => row.responseChars)),
    avgInputTokens: mean(rows.map((row) => row.inputTokens)),
    avgOutputTokens: mean(rows.map((row) => row.outputTokens)),
    avgTotalTokens: mean(rows.map((row) => row.totalTokens))
  };
}

function summarizeDelta(legacy: Record<string, number>, optimized: Record<string, number>): Record<string, number> {
  const keys = [
    "avgLatencyMs",
    "medianLatencyMs",
    "avgPromptChars",
    "avgResponseChars",
    "avgInputTokens",
    "avgOutputTokens",
    "avgTotalTokens"
  ];
  const out: Record<string, number> = {};
  for (const key of keys) {
    const base = legacy[key];
    const next = optimized[key];
    if (!Number.isFinite(base) || !Number.isFinite(next) || base === 0) continue;
    out[`${key}Pct`] = round(((next - base) / base) * 100, 2);
    out[`${key}Abs`] = round(next - base, 2);
  }
  return out;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((total, value) => total + value, 0);
  return round(sum / values.length, 2);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return round((sorted[mid - 1] + sorted[mid]) / 2, 2);
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function composeLegacyPrompt(details: TripIntakePayload): string {
  const lines: string[] = [];
  lines.push("i am planning a ski trip for a group, here are the details:");
  lines.push("");
  lines.push(`- ${legacyFormatDateRange(details.startDate, details.endDate)}`);
  lines.push(`- total of ${details.groupSize} people`);

  if (details.destinationPreference) {
    lines.push(`- a resort in ${details.destinationPreference}`);
  } else if (details.openToSuggestions) {
    lines.push("- we are open to destination suggestions");
  }

  const passLine = legacyDescribePasses(details);
  if (passLine) lines.push(`- ${passLine}`);

  const riderMixLine = legacyDescribeRiderMix(details.groupRiderMix);
  if (riderMixLine) lines.push(`- ${riderMixLine}`);

  const rentalLine = legacyDescribeGearRental(details);
  if (rentalLine) lines.push(`- ${rentalLine}`);

  const lodgingLine = legacyDescribeLodging(details);
  if (lodgingLine) lines.push(`- ${lodgingLine}`);

  const travelLine = legacyDescribeTravel(details);
  if (travelLine) lines.push(`- ${travelLine}`);

  const amenityLine = legacyDescribeAmenities(details);
  if (amenityLine) lines.push(`- ${amenityLine}`);

  lines.push(`- we're ${legacyFormatSkillLevels(details.skillLevels)} in skill level`);
  lines.push(`- we don't want to spend more than $${Math.round(details.budgetPerPerson)} per person for everything all included`);

  lines.push("");
  lines.push(
    "can you produce a few candidate itineraries for this group? please include links to the housing, car rental, and gear shop. format the answer as exactly three sections titled 'Itinerary A', 'Itinerary B', and 'Itinerary C', and for each itinerary include: Why this works, Home, Ski/Ride plan, Parking/reservations, Gear rental, Car rental, and Budget note."
  );

  return lines.join("\n");
}

function legacyFormatDateRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startIso} - ${endIso}`;
  }

  const startMonth = legacyMonthName(start);
  const endMonth = legacyMonthName(end);
  const startDay = legacyOrdinal(start.getDate());
  const endDay = legacyOrdinal(end.getDate());

  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${startMonth} ${startDay} - ${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

function legacyMonthName(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
}

function legacyOrdinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

function legacyDescribePasses(details: TripIntakePayload): string | null {
  if (details.passPreset === "ikon") return "most of the group has ikon";
  if (details.passPreset === "epic") return "most of the group has epic";
  if (details.passPreset === "none") return "nobody has a lift pass";
  if (details.passPreset === "explicit_breakdown" && details.passBreakdown) {
    return `pass breakdown: ${details.passBreakdown}`;
  }
  return null;
}

function legacyDescribeRiderMix(value?: string): string | null {
  if (value === "hybrid") return "half the group is snowboarding and the other half skiing";
  if (value === "skiers") return "everyone is skiing";
  if (value === "snowboarders") return "everyone is snowboarding";
  return null;
}

function legacyDescribeGearRental(details: TripIntakePayload): string | null {
  if (details.rentalRequired === "no") return "nobody needs gear rental";
  if (details.rentalRequired === "yes") {
    const count = details.rentalCount ? `${details.rentalCount} people need` : "some people need";
    if (details.rentalType === "skiers") return `${count} ski gear rental`;
    if (details.rentalType === "snowboarders") return `${count} snowboard gear rental`;
    if (details.rentalType === "both") return "some snowboarders and some skiers need gear rental";
    return `${count} gear rental`;
  }
  if (details.rentalCount) return `${details.rentalCount} people may need gear rental`;
  return null;
}

function legacyDescribeLodging(details: TripIntakePayload): string | null {
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

function legacyDescribeTravel(details: TripIntakePayload): string | null {
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

function legacyDescribeAmenities(details: TripIntakePayload): string | null {
  const wants: string[] = [];
  if (details.hotTubRequired) wants.push("hot tub");
  if (details.kitchenRequired) wants.push("kitchen");
  if (details.laundryRequired) wants.push("laundry");
  if (wants.length === 0) return null;
  return `we want a home with ${legacyJoinNatural(wants)}`;
}

function legacyFormatSkillLevels(levels: string[]): string {
  const normalized = levels.map((level) => {
    if (level === "beginner") return "beginner";
    if (level === "intermediate") return "intermediate";
    if (level === "advanced") return "advanced";
    if (level === "expert") return "expert";
    return level;
  });
  return legacyJoinNatural(normalized);
}

function legacyJoinNatural(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
