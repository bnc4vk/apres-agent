import {
  CandidateReviewInput,
  CandidateReviewResult,
  LLMClient
} from "./client";

export class StubLLMClient implements LLMClient {
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
