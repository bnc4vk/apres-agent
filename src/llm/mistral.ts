import { Mistral } from "@mistralai/mistralai";
import { z } from "zod";
import { TripSpecPatch, TripSpecPatchSchema, TripSpec } from "../core/tripSpec";
import { LLMClient, FollowupQuestionOutput, SpecPatchInput, FollowupQuestionInput } from "./client";
import { mistralApiKey, mistralLargeModel } from "./config";
import { ChatMessage } from "./types";

const EvidenceItemSchema = z
  .object({
    path: z.string().min(1),
    quote: z.string().min(1)
  })
  .strict();

const SpecPatchWithEvidenceSchema = z
  .object({
    patch: TripSpecPatchSchema,
    evidence: z.array(EvidenceItemSchema)
  })
  .strict();

const FollowupSchema = z
  .object({
    acknowledgement: z.string().min(1),
    question: z.string().min(1),
    askedFields: z.array(z.string()).min(1)
  })
  .strict();

const SYSTEM_PROMPT = [
  "You are an assistant for ski-trip planning.",
  "Your job is to extract and clarify trip constraints to build an itinerary.",
  "Stay focused on ski trips. If the user asks for unrelated help, briefly redirect back to ski-trip planning.",
  "Do not invent facts. If something is unknown, omit it or ask a clarifying question.",
  "Dates must be ISO format YYYY-MM-DD when provided."
].join("\n");

function toMistralMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

export class MistralLLMClient implements LLMClient {
  private mistral: Mistral;

  constructor(apiKey = mistralApiKey) {
    this.mistral = new Mistral({ apiKey });
  }

  async generateTripSpecPatch(input: SpecPatchInput): Promise<TripSpecPatch> {
    try {
      const prompt = buildSpecPatchPrompt(input.tripSpec, input.lastUserMessage);
      const response = await this.mistral.chat.parse(
        {
          model: mistralLargeModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...toMistralMessages(input.messages.slice(-12)),
            { role: "user", content: prompt }
          ],
          responseFormat: SpecPatchWithEvidenceSchema,
          temperature: 0.2
        },
        {}
      );

      const parsed = response.choices?.[0]?.message?.parsed;
      if (!parsed) return {};
      const data = parsed as z.infer<typeof SpecPatchWithEvidenceSchema>;
      let patch = data.patch;
      const missingEvidencePaths = findMissingEvidencePaths(patch, data.evidence);
      if (missingEvidencePaths.length > 0) {
        try {
          const repaired = await this.mistral.chat.parse(
            {
              model: mistralLargeModel,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                  role: "user",
                  content: buildRepairPrompt(patch, data.evidence, input.lastUserMessage)
                }
              ],
              responseFormat: TripSpecPatchSchema,
              temperature: 0.2
            },
            {}
          );
          patch = (repaired.choices?.[0]?.message?.parsed as TripSpecPatch) ?? patch;
        } catch {
          // ignore repair failures
        }
      }
      return filterPatchByEvidence(patch, data.evidence, input.lastUserMessage);
    } catch {
      return {};
    }
  }

  async generateFollowupQuestion(input: FollowupQuestionInput): Promise<FollowupQuestionOutput> {
    const prompt = buildFollowupPrompt(input.tripSpec, input.missingFields);
    const response = await this.mistral.chat.parse(
      {
        model: mistralLargeModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...toMistralMessages(input.messages.slice(-12)),
          { role: "user", content: prompt }
        ],
        responseFormat: FollowupSchema,
        temperature: 0.3
      },
      {}
    );

    const parsed = response.choices?.[0]?.message?.parsed;
    if (!parsed) {
      return {
        acknowledgement: "Got it.",
        question: "What else should I know about the trip?",
        askedFields: input.missingFields.slice(0, 1)
      };
    }
    const output = parsed as z.infer<typeof FollowupSchema>;
    return { acknowledgement: output.acknowledgement, question: output.question, askedFields: output.askedFields };
  }
}

function buildSpecPatchPrompt(tripSpec: TripSpec, lastUserMessage: string): string {
  return [
    "Update the TripSpec based on the user's last message.",
    "Return ONLY a JSON object with fields: { patch, evidence }.",
    "patch must match the TripSpecPatch schema.",
    "evidence is a list of { path, quote } where quote is copied verbatim from the user's last message.",
    "Rules:",
    "- Only include fields you are confident the user stated or strongly implied, and provide evidence for each field.",
    "- evidence.path must be the exact field path you are setting (e.g., 'group.size', 'dates.start').",
    "- If the user gives a date window (e.g., 'sometime in March'), set dates.kind='window' and set dates.start/dates.end to the best-known window boundaries if provided; otherwise omit.",
    "- If the user provides a month and year (e.g., 'March 2026'), set dates.kind='window' with start=2026-03-01 and end=2026-03-31.",
    "- Set dates.weekendsPreferred ONLY if the user explicitly mentions weekends/weekdays.",
    "- Set dates.yearConfirmed=true ONLY if the user explicitly included a year in their message.",
    "- If the user says 'no restrictions', set travel.confirmed=true and leave restrictions empty/omitted.",
    "- If the user says 'suggest options', set location.openToSuggestions=true and location.confirmed=true.",
    "- If the user addresses a category (gear/budget/travel/location), set the corresponding *.confirmed=true.",
    "- If the user says 'need rentals' or 'need gear rentals', set gear.rentalRequired=true.",
    "- If the user states a budget band (low/mid/high/luxury/cheap), set budget.band accordingly.",
    "- If the user mentions partial rentals, set gear.rentalNotes and/or gear.rentalShare.",
    "- If the user mentions Ikon/Epic passes, set notes.passes with types/notes.",
    "- If the user mentions a budget in dollars, set budget.perPersonMax or budget.totalMax and budget.currency.",
    "- If the user mentions an airport (e.g., DEN), set travel.arrivalAirport.",
    "- If the user mentions a state (e.g., Colorado), set location.state.",
    "",
    `Current TripSpec JSON:\n${JSON.stringify(tripSpec)}`,
    "",
    `User last message:\n${lastUserMessage}`
  ].join("\n");
}

function buildFollowupPrompt(tripSpec: TripSpec, missingFields: string[]): string {
  return [
    "You are continuing an intake conversation for a ski trip.",
    "Generate a short acknowledgement and then ask the next best question.",
    "Keep the acknowledgement neutral and professional; match the user's tone.",
    "Avoid cheerleading or praise unless the user expresses excitement.",
    "Avoid exclamation marks unless the user used them.",
    "Ask for at most 1-2 missing items and reference what you already captured.",
    "Return JSON with fields: acknowledgement, question, askedFields (list of missing field keys you are asking about).",
    "If traveler departure locations are required (traveler_pods missing), ask for pods like: '3 from SF, 3 from Sacramento'.",
    "",
    `Missing fields: ${missingFields.join(", ")}`,
    `Current TripSpec JSON:\n${JSON.stringify(tripSpec)}`
  ].join("\n");
}

function findMissingEvidencePaths(
  patch: TripSpecPatch,
  evidence: Array<{ path: string; quote: string }>
): string[] {
  const evidencePaths = evidence.map((item) => item.path);
  return evidencePaths.filter((path) => !pathExists(patch, path));
}

function pathExists(obj: any, path: string): boolean {
  const parts = path.split(".");
  let current = obj as any;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return false;
    if (!(part in current)) return false;
    current = current[part];
  }
  return true;
}

function buildRepairPrompt(
  patch: TripSpecPatch,
  evidence: Array<{ path: string; quote: string }>,
  lastUserMessage: string
): string {
  return [
    "Your previous patch omitted some fields that have evidence.",
    "Return a corrected TripSpecPatch JSON that includes every field referenced by evidence.",
    "Use the evidence quotes to set values.",
    "Rules:",
    "- Preserve any existing fields in the patch.",
    "- If evidence includes a month+year, set dates.kind='window' with start/end to the first/last day of that month.",
    "- If evidence mentions weekdays or weekends, set dates.weekendsPreferred accordingly.",
    "- If evidence includes a year, set dates.yearConfirmed=true.",
    "",
    `Evidence list: ${JSON.stringify(evidence)}`,
    `Current patch: ${JSON.stringify(patch)}`,
    `User message: ${lastUserMessage}`
  ].join("\n");
}

function filterPatchByEvidence(
  patch: TripSpecPatch,
  evidence: Array<{ path: string; quote: string }>,
  sourceText: string
): TripSpecPatch {
  const normalizedSource = sourceText.toLowerCase();
  const validEvidence = evidence.filter((item) =>
    normalizedSource.includes(item.quote.toLowerCase())
  );
  const evidenceByPath = new Map<string, string[]>();
  for (const item of validEvidence) {
    const list = evidenceByPath.get(item.path) ?? [];
    list.push(item.quote);
    evidenceByPath.set(item.path, list);
  }

  const allowParentEvidenceFor = new Set([
    "dates",
    "location",
    "gear",
    "budget",
    "notes",
    "notes.passes"
  ]);

  function evidenceFor(path: string): string[] {
    const direct = evidenceByPath.get(path);
    if (direct && direct.length > 0) return direct;
    const parent = path.includes(".") ? path.split(".").slice(0, -1).join(".") : "";
    if (parent && allowParentEvidenceFor.has(parent)) {
      return evidenceByPath.get(parent) ?? [];
    }
    return [];
  }

  function validateLeaf(path: string, value: any): boolean {
    const quotes = evidenceFor(path);
    if (quotes.length === 0) return false;
    const lowerQuotes = quotes.map((quote) => quote.toLowerCase());

    if (path === "group.size") {
      return lowerQuotes.some((quote) => /\d+/.test(quote) && /(people|ppl|persons|group|skiers|riders)/.test(quote));
    }
    if (path === "group.skillLevels") {
      return lowerQuotes.some((quote) =>
        /(beginner|intermediate|advanced|expert|mixed)/.test(quote)
      );
    }
    if (path === "travel.noFlying") {
      return lowerQuotes.some((quote) =>
        /(no flying|can't fly|cannot fly|flying ok|flying okay|can fly)/.test(quote)
      );
    }
    if (path === "location.openToSuggestions") {
      return lowerQuotes.some((quote) => /suggest/.test(quote));
    }
    if (path === "dates.yearConfirmed") {
      return lowerQuotes.some((quote) => /20\d{2}/.test(quote));
    }
    if (path === "dates.weekendsPreferred") {
      return lowerQuotes.some((quote) => /(weekend|weekends|weekday|weekdays)/.test(quote));
    }
    if (path === "location.nearMajorAirport") {
      return lowerQuotes.some((quote) => /airport/.test(quote));
    }
    if (path === "budget.perPersonMax" || path === "budget.totalMax") {
      return lowerQuotes.some((quote) => /\$?\d+/.test(quote));
    }

    return true;
  }

  function filterObject(obj: any, currentPath: string): any {
    if (obj === null || obj === undefined) return undefined;
    if (Array.isArray(obj)) {
      return validateLeaf(currentPath, obj) ? obj : undefined;
    }
    if (typeof obj !== "object") {
      return validateLeaf(currentPath, obj) ? obj : undefined;
    }
    const result: any = Array.isArray(obj) ? [] : {};
    let hasAny = false;
    for (const [key, value] of Object.entries(obj)) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      const filtered = filterObject(value, nextPath);
      if (filtered !== undefined) {
        result[key] = filtered;
        hasAny = true;
      }
    }
    return hasAny ? result : undefined;
  }

  const filtered = filterObject(patch, "");
  return (filtered ?? {}) as TripSpecPatch;
}
