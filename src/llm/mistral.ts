import { Mistral } from "@mistralai/mistralai";
import dayjs from "dayjs";
import { z } from "zod";
import { TripSpecPatchSchema, TripSpec } from "../core/tripSpec";
import {
  AssumptionResolutionInput,
  AssumptionResolutionResult,
  ExtractedFieldState,
  LLMClient,
  SpecExtractionResult,
  SpecPatchInput
} from "./client";
import { mistralApiKey, mistralLargeModel } from "./config";
import { ChatMessage } from "./types";

const ExtractedFieldStateSchema = z
  .object({
    path: z.string().min(1),
    confidence: z.number().min(0).max(1),
    evidence: z.string().min(1)
  })
  .strict();

const AssumptionSchema = z
  .object({
    path: z.string().min(1),
    rationale: z.string().min(1),
    confidence: z.number().min(0).max(1)
  })
  .strict();

const SpecExtractionSchema = z
  .object({
    patch: TripSpecPatchSchema,
    fieldStates: z.array(ExtractedFieldStateSchema),
    unresolvedPaths: z.array(z.string()),
    clarifyingQuestions: z.array(z.string()),
    assumptions: z.array(AssumptionSchema)
  })
  .strict();

const DateCompletionSchema = z
  .object({
    start: z.string().optional(),
    end: z.string().optional(),
    kind: z.enum(["exact", "window"]).optional(),
    weekendsPreferred: z.boolean().optional(),
    tripLengthDays: z.number().int().positive().optional(),
    flexibleDays: z.number().int().min(0).optional(),
    confidence: z.number().min(0).max(1),
    rationale: z.string().min(1)
  })
  .strict();

const AssumptionResolutionSchema = z
  .object({
    acceptedIds: z.array(z.string()),
    rejectedIds: z.array(z.string()),
    unsureIds: z.array(z.string())
  })
  .strict();

const SYSTEM_PROMPT = [
  "You are a structured extraction engine for ski trip planning.",
  "Extract as much TripSpec data as possible from the latest user message using conversation context.",
  "Do not use hardcoded parsing behavior. Use semantic interpretation.",
  "For every extracted field, return confidence (0-1) and verbatim evidence from the latest user message.",
  "When values are inferred rather than explicit, include them in assumptions with rationale and confidence.",
  "If something remains unclear, return unresolvedPaths and one concise clarifying question.",
  "Output must be valid JSON matching the provided schema."
].join("\n");

function toMistralMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

export class MistralLLMClient implements LLMClient {
  private mistral: Mistral;

  constructor(apiKey = mistralApiKey) {
    this.mistral = new Mistral({ apiKey });
  }

  async extractTripSpec(input: SpecPatchInput): Promise<SpecExtractionResult> {
    try {
      const prompt = buildExtractionPrompt(input.tripSpec, input.lastUserMessage);
      const response = await this.mistral.chat.parse(
        {
          model: mistralLargeModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...toMistralMessages(input.messages.slice(-12)),
            { role: "user", content: prompt }
          ],
          responseFormat: SpecExtractionSchema,
          temperature: 0.15
        },
        {}
      );

      const parsed = response.choices?.[0]?.message?.parsed;
      if (!parsed) return emptyExtraction();
      const data = parsed as z.infer<typeof SpecExtractionSchema>;
      const sanitized = sanitizeExtraction(data, input.lastUserMessage);
      return await this.completeDatesIfNeeded(sanitized, input);
    } catch {
      return emptyExtraction();
    }
  }

  async resolveAssumptions(input: AssumptionResolutionInput): Promise<AssumptionResolutionResult> {
    if (input.pendingAssumptions.length === 0) {
      return emptyAssumptionResolution();
    }
    try {
      const prompt = buildAssumptionResolutionPrompt(input);
      const response = await this.mistral.chat.parse(
        {
          model: mistralLargeModel,
          messages: [
            {
              role: "system",
              content:
                "You classify whether a user accepted, rejected, or left uncertain each pending assumption in a planning conversation."
            },
            ...toMistralMessages(input.messages.slice(-12)),
            { role: "user", content: prompt }
          ],
          responseFormat: AssumptionResolutionSchema,
          temperature: 0.1
        },
        {}
      );
      const parsed = response.choices?.[0]?.message?.parsed as z.infer<typeof AssumptionResolutionSchema> | undefined;
      if (!parsed) return emptyAssumptionResolution();
      return sanitizeAssumptionResolution(parsed, input.pendingAssumptions.map((item) => item.id));
    } catch {
      return emptyAssumptionResolution();
    }
  }

  private async completeDatesIfNeeded(
    extraction: SpecExtractionResult,
    input: SpecPatchInput
  ): Promise<SpecExtractionResult> {
    if (!shouldAttemptDateCompletion(extraction)) return extraction;
    if (hasValidDateRange(extraction.patch.dates?.start, extraction.patch.dates?.end)) return extraction;

    try {
      const prompt = buildDateCompletionPrompt(input.tripSpec, input.lastUserMessage, extraction.patch.dates ?? {});
      const response = await this.mistral.chat.parse(
        {
          model: mistralLargeModel,
          messages: [
            { role: "system", content: "You convert date intent into concrete ISO date ranges." },
            { role: "user", content: prompt }
          ],
          responseFormat: DateCompletionSchema,
          temperature: 0.1
        },
        {}
      );
      const parsed = response.choices?.[0]?.message?.parsed as z.infer<typeof DateCompletionSchema> | undefined;
      if (!parsed) return extraction;
      if (!hasValidDateRange(parsed.start, parsed.end)) return extraction;

      const confidence = clamp(parsed.confidence);
      const nextPatch = {
        ...extraction.patch,
        dates: {
          ...(extraction.patch.dates ?? {}),
          start: parsed.start,
          end: parsed.end,
          kind: parsed.kind ?? extraction.patch.dates?.kind,
          weekendsPreferred: parsed.weekendsPreferred ?? extraction.patch.dates?.weekendsPreferred,
          tripLengthDays: parsed.tripLengthDays ?? extraction.patch.dates?.tripLengthDays,
          flexibleDays: parsed.flexibleDays ?? extraction.patch.dates?.flexibleDays
        }
      };

      const nextFieldStates = [...extraction.fieldStates];
      nextFieldStates.push({
        path: "dates.start",
        confidence,
        evidence: input.lastUserMessage
      });
      nextFieldStates.push({
        path: "dates.end",
        confidence,
        evidence: input.lastUserMessage
      });

      const nextAssumptions = [...extraction.assumptions];
      if (confidence < 0.85) {
        nextAssumptions.push({
          path: "dates.start",
          rationale: parsed.rationale,
          confidence
        });
        nextAssumptions.push({
          path: "dates.end",
          rationale: parsed.rationale,
          confidence
        });
      }

      const nextUnresolved = extraction.unresolvedPaths.filter((path) => !(path === "dates" || path.startsWith("dates.")));
      return {
        patch: nextPatch,
        fieldStates: dedupeFieldStates(nextFieldStates),
        unresolvedPaths: nextUnresolved,
        clarifyingQuestions: extraction.clarifyingQuestions,
        assumptions: dedupeAssumptions(nextAssumptions)
      };
    } catch {
      return extraction;
    }
  }
}

function buildExtractionPrompt(tripSpec: TripSpec, lastUserMessage: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "Given the current TripSpec and the latest user message, produce a structured extraction result.",
    "Return fields: patch, fieldStates, unresolvedPaths, clarifyingQuestions, assumptions.",
    "Requirements:",
    "- fieldStates.path must be a precise dot-path in TripSpec.",
    "- fieldStates.evidence must be a direct quote from the latest user message.",
    "- For relative time phrases, resolve concrete ISO dates using today's date.",
    "- If the user gives any usable date preference, set dates.start and dates.end in patch.",
    "- Do not set dates.kind without dates.start and dates.end.",
    "- Any inferred value that should be used must be included in patch (do not put values only in assumptions).",
    "- For inferred dates, keep confidence in the assumption range (0.60-0.84) and include rationale.",
    "- Include unresolved paths only for fields needed to proceed.",
    "- Keep clarifyingQuestions short and user-friendly.",
    "- Use confidence to reflect certainty. Do not inflate confidence.",
    "",
    `Today's date: ${today}`,
    "",
    `Current TripSpec JSON:\n${JSON.stringify(tripSpec)}`,
    "",
    `Latest user message:\n${lastUserMessage}`
  ].join("\n");
}

function sanitizeExtraction(
  data: z.infer<typeof SpecExtractionSchema>,
  sourceText: string
): SpecExtractionResult {
  const normalized = sourceText.toLowerCase();
  const fieldStates: ExtractedFieldState[] = [];
  for (const state of data.fieldStates) {
    const path = normalizePath(state.path);
    if (!path) continue;
    if (!normalized.includes(state.evidence.toLowerCase())) continue;
    fieldStates.push({
      path,
      confidence: clamp(state.confidence),
      evidence: state.evidence
    });
  }

  const unresolvedPaths = [...new Set((data.unresolvedPaths ?? []).map(normalizePath).filter(Boolean))];
  const assumptions = (data.assumptions ?? [])
    .map((assumption) => ({
      path: normalizePath(assumption.path),
      rationale: assumption.rationale,
      confidence: clamp(assumption.confidence)
    }))
    .filter((assumption) => Boolean(assumption.path));

  return {
    patch: data.patch,
    fieldStates,
    unresolvedPaths: unresolvedPaths as string[],
    clarifyingQuestions: (data.clarifyingQuestions ?? []).filter(Boolean).slice(0, 2),
    assumptions: assumptions as Array<{ path: string; rationale: string; confidence: number }>
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function emptyExtraction(): SpecExtractionResult {
  return {
    patch: {},
    fieldStates: [],
    unresolvedPaths: [],
    clarifyingQuestions: [],
    assumptions: []
  };
}

function emptyAssumptionResolution(): AssumptionResolutionResult {
  return {
    acceptedIds: [],
    rejectedIds: [],
    unsureIds: []
  };
}

function normalizePath(path: string): string {
  if (!path) return "";
  return path.replace(/^patch\./, "").trim();
}

function buildAssumptionResolutionPrompt(input: AssumptionResolutionInput): string {
  return [
    "Decide the user intent for each pending assumption.",
    "Return IDs in exactly one list: acceptedIds, rejectedIds, or unsureIds.",
    "Guidance:",
    "- If user says remaining assumptions are fine/valid, accept those pending items.",
    "- If user provides a specific override for one item, reject that item and let extraction handle the explicit value.",
    "- If no clear signal for an item, mark unsure.",
    "- 'the rest are fine', 'the remaining assumptions are valid', and similar blanket acceptance phrases mean ACCEPT all pending items except any item explicitly overridden in the same message.",
    "- A specific correction to one item plus a blanket acceptance of the rest should usually produce: rejectedIds=[corrected item], acceptedIds=[all others].",
    "",
    "Examples:",
    "- Pending: [passes, travel_restrictions, location_input]; User: 'the intermediate skiers have Epic passes, the rest of your assumptions are fine' => reject passes; accept travel_restrictions and location_input.",
    "- Pending: [travel_restrictions, location_input]; User: 'those assumptions are valid' => accept both.",
    "- Pending: [budget, gear_rental]; User: '$1000 pp and beginners need rentals' => reject both (user provided replacements).",
    "",
    `Pending assumptions JSON:\n${JSON.stringify(input.pendingAssumptions)}`,
    "",
    `Latest user message:\n${input.lastUserMessage}`
  ].join("\n");
}

function sanitizeAssumptionResolution(
  result: z.infer<typeof AssumptionResolutionSchema>,
  knownIds: string[]
): AssumptionResolutionResult {
  const known = new Set(knownIds);
  const acceptedIds = [...new Set(result.acceptedIds)].filter((id) => known.has(id));
  const rejectedIds = [...new Set(result.rejectedIds)].filter((id) => known.has(id) && !acceptedIds.includes(id));
  const unsureIds = [...new Set(result.unsureIds)].filter(
    (id) => known.has(id) && !acceptedIds.includes(id) && !rejectedIds.includes(id)
  );
  return { acceptedIds, rejectedIds, unsureIds };
}

function buildDateCompletionPrompt(tripSpec: TripSpec, latestUserMessage: string, currentDates: Record<string, unknown>): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "Resolve date intent into concrete ISO date range values.",
    "Requirements:",
    "- Output start and end in YYYY-MM-DD when the message has enough temporal intent.",
    "- Interpret relative phrases based on today's date.",
    "- Preserve weekend intent when present.",
    "- Confidence should be lower for inferred ranges.",
    "",
    `Today's date: ${today}`,
    `Current TripSpec dates: ${JSON.stringify(tripSpec.dates)}`,
    `Current extracted dates patch: ${JSON.stringify(currentDates)}`,
    `Latest user message: ${latestUserMessage}`
  ].join("\n");
}

function shouldAttemptDateCompletion(extraction: SpecExtractionResult): boolean {
  if (hasValidDateRange(extraction.patch.dates?.start, extraction.patch.dates?.end)) return false;
  const hasDatePatchHint = Boolean(
    extraction.patch.dates &&
      Object.keys(extraction.patch.dates).some((key) => key !== "start" && key !== "end")
  );
  const hasDateFieldState = extraction.fieldStates.some((state) => state.path === "dates" || state.path.startsWith("dates."));
  const hasDateAssumption = extraction.assumptions.some((assumption) =>
    assumption.path === "dates" || assumption.path.startsWith("dates.")
  );
  return hasDatePatchHint || hasDateFieldState || hasDateAssumption;
}

function hasValidDateRange(start?: string, end?: string): boolean {
  if (!start || !end) return false;
  const startDate = dayjs(start);
  const endDate = dayjs(end);
  return startDate.isValid() && endDate.isValid() && !endDate.isBefore(startDate);
}

function dedupeFieldStates(states: ExtractedFieldState[]): ExtractedFieldState[] {
  const byPath = new Map<string, ExtractedFieldState>();
  for (const state of states) {
    const existing = byPath.get(state.path);
    if (!existing || state.confidence >= existing.confidence) {
      byPath.set(state.path, state);
    }
  }
  return [...byPath.values()];
}

function dedupeAssumptions(
  assumptions: Array<{ path: string; rationale: string; confidence: number }>
): Array<{ path: string; rationale: string; confidence: number }> {
  const byKey = new Map<string, { path: string; rationale: string; confidence: number }>();
  for (const assumption of assumptions) {
    const key = `${assumption.path}:${assumption.rationale}`;
    const existing = byKey.get(key);
    if (!existing || assumption.confidence >= existing.confidence) {
      byKey.set(key, assumption);
    }
  }
  return [...byKey.values()];
}
