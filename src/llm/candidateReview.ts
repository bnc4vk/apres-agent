import { z } from "zod";
import { CandidateReviewInput, CandidateReviewResult } from "./client";

export const CandidateReviewItinerarySchema = z
  .object({
    itineraryId: z.string().min(1),
    rank: z.number().int().positive().optional(),
    verdict: z.string().min(1).nullish().optional(),
    rationale: z.string().min(1),
    tradeoffs: z.array(z.string().min(1)).max(6).optional().default([]),
    confidence: z.number().min(0).max(1).optional().default(0.6)
  })
  .passthrough();

export const CandidateReviewSchema = z
  .object({
    summary: z.string().min(1),
    methodology: z.string().min(1),
    recommendedOrder: z.array(z.string().min(1)).optional().default([]),
    itineraries: z.array(CandidateReviewItinerarySchema).min(1),
    caveats: z.array(z.string().min(1)).max(8).optional().default([])
  })
  .passthrough();

export const CANDIDATE_REVIEW_SYSTEM_PROMPT = [
  "You are an itinerary evaluator for ski trip planning.",
  "You must rank deterministic itinerary candidates and explain trade-offs without inventing prices, resorts, links, or facts.",
  "Use only the provided structured payload.",
  "Prefer grounded reasoning on budget, pass ownership fit, ski-skill fit, lodging logistics, and travel constraints.",
  "Do not restate every field; produce concise, decision-useful reasoning.",
  "Return valid JSON matching the requested schema."
].join("\n");

export function buildCandidateReviewPrompt(input: CandidateReviewInput): string {
  return [
    "Review and rank the itinerary candidates.",
    "Requirements:",
    "- Use the provided deterministic scores/costs as inputs, not as unquestioned truth.",
    "- Explain the trade-offs for each candidate in plain language.",
    "- recommendedOrder must contain itinerary IDs from the candidate list only.",
    "- Rank values must start at 1 and be unique.",
    "- If two options are close, say why.",
    "- Mention pass coverage and lodging group-fit explicitly where relevant.",
    "- Be terse: summary <= 50 words, methodology <= 35 words.",
    "- Each rationale <= 70 words. Prefer 1-2 tradeoffs per itinerary.",
    "- Use field name 'rationale' (not 'explanation').",
    "",
    `TripSpec summary JSON:\n${JSON.stringify(buildCompactTripSpecSummary(input))}`,
    "",
    `Candidate payload JSON:\n${JSON.stringify(input.payload)}`
  ].join("\n");
}

export function sanitizeCandidateReview(
  value: unknown,
  validItineraryIds: string[]
): CandidateReviewResult | null {
  const normalizedRoot = normalizeReviewRoot(value);
  if (!normalizedRoot) {
    if (process.env.LLM_DEBUG_REVIEW === "1") {
      console.warn("[candidateReview] normalizeReviewRoot returned null");
    }
    return null;
  }

  const parsed = CandidateReviewSchema.safeParse(normalizedRoot);
  if (!parsed.success) {
    if (process.env.LLM_DEBUG_REVIEW === "1") {
      console.warn("[candidateReview] schema parse failed", parsed.error.issues.slice(0, 8));
      console.warn("[candidateReview] normalized root", JSON.stringify(normalizedRoot, null, 2).slice(0, 6000));
    }
    return null;
  }

  const valid = new Set(validItineraryIds);
  const aliasMap = buildIdAliasMap(validItineraryIds);
  const seen = new Set<string>();
  const itineraries = parsed.data.itineraries
    .map((item) => ({
      ...item,
      itineraryId: resolveItineraryId(item.itineraryId, valid, aliasMap)
    }))
    .filter((item) => Boolean(item.itineraryId))
    .filter((item) => {
      const itineraryId = item.itineraryId as string;
      if (seen.has(itineraryId)) return false;
      seen.add(itineraryId);
      return true;
    })
    .map((item, index) => ({
      ...item,
      itineraryId: item.itineraryId as string,
      rank: typeof item.rank === "number" ? item.rank : index + 1,
      verdict: normalizeVerdict(item.verdict),
      confidence: clamp(item.confidence)
    }))
    .sort((a, b) => a.rank - b.rank)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  if (itineraries.length === 0) {
    if (process.env.LLM_DEBUG_REVIEW === "1") {
      console.warn("[candidateReview] no valid itineraries after id resolution", {
        validItineraryIds,
        parsedItineraryIds: parsed.data.itineraries.map((i) => i.itineraryId)
      });
    }
    return null;
  }

  const recommendedOrder = parsed.data.recommendedOrder
    .map((id) => resolveItineraryId(id, valid, aliasMap))
    .filter((id): id is string => Boolean(id));
  for (const item of itineraries) {
    if (!recommendedOrder.includes(item.itineraryId)) recommendedOrder.push(item.itineraryId);
  }

  return {
    summary: parsed.data.summary,
    methodology: parsed.data.methodology,
    recommendedOrder,
    itineraries,
    caveats: parsed.data.caveats
  };
}

function normalizeVerdict(value: string | null | undefined): CandidateReviewResult["itineraries"][number]["verdict"] {
  const raw = (value ?? "").toLowerCase().trim();
  if (!raw) return "backup";
  if (raw.includes("overall")) return "best_overall";
  if (raw.includes("value") || raw.includes("budget")) return "best_value";
  if (raw.includes("pass")) return "best_pass_fit";
  if (raw.includes("snow") || raw.includes("skill")) return "best_snow_skill";
  if (raw.includes("convenience") || raw.includes("travel")) return "high_convenience";
  return "backup";
}

function normalizeReviewRoot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      summary: "LLM ranked itinerary candidates based on the provided deterministic trip-planning inputs.",
      methodology: "Grounded comparison of budget, pass fit, ski-skill fit, lodging logistics, and travel convenience.",
      recommendedOrder: [],
      itineraries: value.map(normalizeItineraryLike).filter(Boolean),
      caveats: []
    };
  }

  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const itinerariesSource =
    asArray(raw.itineraries) ??
    asArray(raw.reviews) ??
    asArray(raw.candidates) ??
    asArray(raw.rankings) ??
    asArray(raw.options) ??
    rationalesObjectToArray(raw.rationales, raw.recommendedOrder);
  if (!itinerariesSource || itinerariesSource.length === 0) return null;

  const normalizedItineraries = itinerariesSource.map(normalizeItineraryLike).filter(Boolean);
  if (normalizedItineraries.length === 0) return null;

  const recommendedOrder =
    normalizeRecommendedOrder(raw.recommendedOrder) ??
    normalizeRecommendedOrder(raw.recommended_order) ??
    normalizeRecommendedOrder(raw.order) ??
    normalizeRecommendedOrder(raw.ranking);

  const summary =
    pickString(raw.summary) ??
    pickString(raw.overview) ??
    pickString(raw.executiveSummary) ??
    pickString(raw.executive_summary) ??
    "LLM ranked itinerary candidates based on the provided deterministic trip-planning inputs.";

  const methodology =
    pickString(raw.methodology) ??
    pickString(raw.approach) ??
    pickString(raw.reasoningMethod) ??
    pickString(raw.reasoning_method) ??
    pickString(raw.framework) ??
    "Grounded comparison of budget, pass fit, ski-skill fit, lodging logistics, and travel convenience.";

  const caveats =
    normalizeStringArray(raw.caveats) ??
    normalizeStringArray(raw.warnings) ??
    normalizeStringArray(raw.limitations) ??
    [];

  return {
    ...raw,
    summary,
    methodology,
    recommendedOrder: recommendedOrder ?? [],
    itineraries: normalizedItineraries,
    caveats
  };
}

function normalizeItineraryLike(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const itineraryId =
    pickString(raw.itineraryId) ??
    pickString(raw.itinerary_id) ??
    pickString(raw.id) ??
    pickString(raw.candidateId) ??
    pickString(raw.candidate_id);
  if (!itineraryId) return null;

  const tradeoffs =
    normalizeStringArray(raw.tradeoffs) ??
    normalizeStringArray(raw.tradeOffs) ??
    normalizeStringArray(raw.trade_offs) ??
    normalizeStringArray(raw.cons) ??
    normalizeStringArray(raw.risks) ??
    [];

  const rationale =
    pickString(raw.rationale) ??
    pickString(raw.explanation) ??
    pickString(raw.reason) ??
    pickString(raw.why) ??
    pickString(raw.analysis) ??
    pickString(raw.justification) ??
    summarizeTradeoffsFallback(tradeoffs) ??
    "Reasoning not provided.";

  const rank = toPositiveInt(raw.rank ?? raw.position ?? raw.order ?? raw.priority);
  const confidence = normalizeConfidence(raw.confidence ?? raw.scoreConfidence ?? raw.confidence_pct ?? raw.confidencePct);
  const verdict =
    pickString(raw.verdict) ??
    pickString(raw.label) ??
    pickString(raw.recommendation) ??
    pickString(raw.category) ??
    undefined;

  return {
    itineraryId,
    rank,
    verdict,
    rationale,
    tradeoffs,
    confidence
  };
}

function summarizeTradeoffsFallback(tradeoffs: string[]): string | null {
  if (tradeoffs.length === 0) return null;
  return tradeoffs[0];
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const next = value
    .map((item) => pickString(item))
    .filter((item): item is string => Boolean(item));
  return next.length ? next : [];
}

function normalizeRecommendedOrder(value: unknown): string[] | null {
  const fromStrings = normalizeStringArray(value);
  if (fromStrings) return fromStrings;
  if (!Array.isArray(value)) return null;
  const ids = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      return (
        pickString(record.itineraryId) ??
        pickString(record.itinerary_id) ??
        pickString(record.id) ??
        pickString(record.candidateId) ??
        pickString(record.candidate_id)
      );
    })
    .filter((id): id is string => Boolean(id));
  return ids.length ? ids : [];
}

function rationalesObjectToArray(rationales: unknown, recommendedOrder: unknown): unknown[] | null {
  if (!rationales || typeof rationales !== "object" || Array.isArray(rationales)) return null;
  const rankById = new Map<string, number>();
  if (Array.isArray(recommendedOrder)) {
    for (let index = 0; index < recommendedOrder.length; index += 1) {
      const item = recommendedOrder[index];
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const id =
          pickString(record.itineraryId) ??
          pickString(record.itinerary_id) ??
          pickString(record.id) ??
          pickString(record.candidateId) ??
          pickString(record.candidate_id);
        const rank = toPositiveInt(record.rank) ?? index + 1;
        if (id) rankById.set(id, rank);
      } else if (typeof item === "string" && item.trim()) {
        rankById.set(item.trim(), index + 1);
      }
    }
  }

  return Object.entries(rationales as Record<string, unknown>).map(([itineraryId, value], index) => {
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return {
        itineraryId,
        rank: rankById.get(itineraryId) ?? toPositiveInt(record.rank) ?? index + 1,
        rationale:
          pickString(record.rationale) ??
          pickString(record.explanation) ??
          pickString(record.reason) ??
          "Reasoning not provided.",
        tradeoffs:
          normalizeStringArray(record.tradeoffs) ??
          normalizeStringArray(record.trade_offs) ??
          normalizeStringArray(record.cons) ??
          [],
        confidence: normalizeConfidence(record.confidence),
        verdict:
          pickString(record.verdict) ??
          pickString(record.label) ??
          undefined
      };
    }
    return {
      itineraryId,
      rank: rankById.get(itineraryId) ?? index + 1,
      rationale: pickString(value) ?? "Reasoning not provided.",
      tradeoffs: []
    };
  });
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value !== "string") return undefined;
  const num = Number(value.trim());
  return Number.isFinite(num) && num > 0 ? Math.round(num) : undefined;
}

function normalizeConfidence(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1 && value <= 100) return value / 100;
    return value;
  }
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/%$/, "");
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return undefined;
  return cleaned !== value.trim() || num > 1 ? num / 100 : num;
}

function buildIdAliasMap(validIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of validIds) {
    const aliases = new Set([
      id,
      id.replace(/-option-/g, "-"),
      id.replace(/-option/g, ""),
      id.replace(/\boption\b/gi, "")
    ]);
    for (const alias of aliases) {
      const key = normalizeIdKey(alias);
      if (!key) continue;
      if (!map.has(key)) map.set(key, id);
    }
  }
  return map;
}

function resolveItineraryId(
  rawId: string,
  valid: Set<string>,
  aliasMap: Map<string, string>
): string | null {
  if (valid.has(rawId)) return rawId;
  const key = normalizeIdKey(rawId);
  if (!key) return null;
  return aliasMap.get(key) ?? null;
}

function normalizeIdKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildCompactTripSpecSummary(input: CandidateReviewInput) {
  const spec = input.tripSpec;
  return {
    groupSize: spec.group.size ?? null,
    skillLevels: spec.group.skillLevels ?? [],
    budget: {
      perPersonMax: spec.budget.perPersonMax ?? null,
      totalMax: spec.budget.totalMax ?? null,
      band: spec.budget.band ?? null
    },
    passes: spec.notes.passes ?? null,
    travel: {
      noFlying: spec.travel.noFlying ?? null,
      maxDriveHours: spec.travel.maxDriveHours ?? null,
      arrivalAirport: spec.travel.arrivalAirport ?? null,
      restrictions: spec.travel.restrictions ?? []
    },
    dates: spec.dates,
    location: spec.location,
    lodgingConstraints: spec.lodgingConstraints
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
