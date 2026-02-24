import {
  AssumptionResolutionInput,
  AssumptionResolutionResult,
  CandidateReviewInput,
  CandidateReviewResult,
  ExtractedFieldState,
  LLMClient,
  SpecExtractionResult,
  SpecPatchInput
} from "./client";

export class StubLLMClient implements LLMClient {
  async extractTripSpec(input: SpecPatchInput): Promise<SpecExtractionResult> {
    const message = input.lastUserMessage.toLowerCase();
    const patch: SpecExtractionResult["patch"] = {};
    const fieldStates: ExtractedFieldState[] = [];
    const unresolvedPaths: string[] = [];
    const clarifyingQuestions: string[] = [];
    const assumptions: SpecExtractionResult["assumptions"] = [];

    if (message.includes("we are 6") || message.includes("6 people")) {
      patch.group = { size: 6, skillLevels: ["beginner", "intermediate"] };
      patch.dates = { start: "2026-02-20", end: "2026-02-23", kind: "exact", yearConfirmed: true };
      patch.gear = { rentalRequired: true, confirmed: true };
      patch.budget = { band: "mid", confirmed: true };
      patch.notes = { passes: { noPassCount: 6, confirmed: true } };
      patch.travel = { noFlying: true, maxDriveHours: 4, confirmed: true };
      patch.location = { openToSuggestions: true, confirmed: true };
      fieldStates.push(
        state("group.size", 0.96, "6 people"),
        state("group.skillLevels", 0.84, "mixed beginner/intermediate"),
        state("dates.start", 0.92, "Feb 20-23"),
        state("dates.end", 0.92, "Feb 20-23"),
        state("travel.noFlying", 0.89, "no flying"),
        state("travel.maxDriveHours", 0.83, "max 4 hours")
      );
      assumptions.push({
        path: "group.skillLevels",
        rationale: "Mapped mixed skill phrase to explicit levels.",
        confidence: 0.84
      });
    }

    if (message.includes("we are 4") || message.includes("4 people")) {
      patch.group = { size: 4, skillLevels: ["beginner"] };
      patch.dates = { start: "2026-02-20", end: "2026-02-23", kind: "exact", yearConfirmed: true };
      patch.gear = { rentalRequired: true, confirmed: true };
      patch.budget = { band: "mid", confirmed: true };
      patch.notes = { passes: { noPassCount: 4, confirmed: true } };
      patch.travel = { noFlying: true, maxDriveHours: 4, confirmed: true };
      patch.location = { openToSuggestions: true, confirmed: true };
      fieldStates.push(state("group.size", 0.97, "4 people"), state("group.skillLevels", 0.95, "beginners"));
    }

    if (message.includes("3 from sf")) {
      patch.travelers = { pods: [{ origin: "SF", count: 3 }, { origin: "Sacramento", count: 3 }] };
      fieldStates.push(state("travelers.pods", 0.95, "3 from SF, 3 from Sacramento"));
    }

    if (message.includes("any weekend in the next two months")) {
      patch.dates = {
        start: "2026-02-01",
        end: "2026-03-31",
        kind: "window",
        weekendsPreferred: true
      };
      fieldStates.push(state("dates.start", 0.72, "any weekend in the next two months"));
      fieldStates.push(state("dates.end", 0.72, "any weekend in the next two months"));
      assumptions.push({
        path: "dates.start",
        rationale: "Interpreted relative window based on current date.",
        confidence: 0.72
      });
      assumptions.push({
        path: "dates.end",
        rationale: "Interpreted relative window based on current date.",
        confidence: 0.72
      });
      clarifyingQuestions.push(
        "I interpreted that as weekend-preferred dates over the next two months. Should I use that window?"
      );
    }

    if (message.includes("ikon") || message.includes("epic") || message.includes("indy") || message.includes("pass")) {
      patch.notes = { ...(patch.notes ?? {}), passes: { notes: input.lastUserMessage, confirmed: true } };
      fieldStates.push(state("notes.passes.notes", 0.8, input.lastUserMessage));
      assumptions.push({
        path: "notes.passes.notes",
        rationale: "Captured pass details as freeform when counts are unclear.",
        confidence: 0.8
      });
    }

    if (message.includes("still gathering")) {
      unresolvedPaths.push("group.size", "skillLevels");
      clarifyingQuestions.push("I can keep refining, but I still need group size and skill mix to make good options.");
    }

    return {
      patch,
      fieldStates,
      unresolvedPaths,
      clarifyingQuestions,
      assumptions
    };
  }

  async resolveAssumptions(input: AssumptionResolutionInput): Promise<AssumptionResolutionResult> {
    const message = input.lastUserMessage.toLowerCase();
    const allIds = input.pendingAssumptions.map((item) => item.id);
    if (allIds.length === 0) return { acceptedIds: [], rejectedIds: [], unsureIds: [] };

    if (
      message.includes("proceed with assumptions") ||
      ((message.includes("rest") || message.includes("remaining")) &&
        (message.includes("fine") || message.includes("valid") || message.includes("okay") || message.includes("ok")))
    ) {
      return { acceptedIds: allIds, rejectedIds: [], unsureIds: [] };
    }

    if (message.includes("don't assume") || message.includes("do not assume")) {
      return { acceptedIds: [], rejectedIds: allIds, unsureIds: [] };
    }

    return { acceptedIds: [], rejectedIds: [], unsureIds: allIds };
  }

  async reviewItineraryCandidates(input: CandidateReviewInput): Promise<CandidateReviewResult | null> {
    const sorted = input.payload.candidates
      .slice()
      .sort(
        (a, b) =>
          (b.matrix.overallScore ?? 0) - (a.matrix.overallScore ?? 0) ||
          ((a.budget.perPersonTotal ?? Infinity) - (b.budget.perPersonTotal ?? Infinity))
      );
    if (sorted.length === 0) return null;
    return {
      summary: `Top recommendation is ${sorted[0]?.resortName ?? "the first option"} based on the best combined deterministic scores.`,
      methodology:
        "Stub review ranks deterministic candidates using overall score first, then lower estimated per-person total as a tie-breaker.",
      recommendedOrder: sorted.map((candidate) => candidate.itineraryId),
      itineraries: sorted.map((candidate, index) => ({
        itineraryId: candidate.itineraryId,
        rank: index + 1,
        verdict: index === 0 ? "best_overall" : index === 1 ? "best_value" : "backup",
        rationale: `${candidate.resortName} scores ${Math.round(candidate.matrix.overallScore * 100)}% overall with estimated total ${
          candidate.budget.perPersonTotal ? `$${candidate.budget.perPersonTotal} pp` : "pending"
        }.`,
        tradeoffs: [
          `Pass fit ${Math.round(candidate.matrix.passFitScore * 100)}%`,
          `Lodging fit ${Math.round(candidate.matrix.lodgingFitScore * 100)}%`,
          `Travel fit ${Math.round(candidate.matrix.travelFitScore * 100)}%`
        ],
        confidence: 0.55
      })),
      caveats: ["Stub review is heuristic only; use Mistral/OpenAI profiles for model-based trade-off analysis."]
    };
  }
}

function state(path: string, confidence: number, evidence: string): ExtractedFieldState {
  return { path, confidence, evidence };
}
