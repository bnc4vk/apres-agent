import { DecisionPackage } from "../core/decision";
import { TripSpec } from "../core/tripSpec";
import { LLMClient, CandidateReviewInput } from "../llm/client";
import { getLLMClient } from "../llm/factory";
import { llmReasoningReviewEnabled } from "../llm/config";

export async function enrichDecisionPackageWithLLMReview(
  spec: TripSpec,
  decisionPackage: DecisionPackage,
  llm: LLMClient = getLLMClient(),
  options?: { force?: boolean }
): Promise<DecisionPackage> {
  if (!options?.force && process.env.EVAL_SKIP_INTERMEDIATE_REVIEW === "1") return decisionPackage;
  if (!llmReasoningReviewEnabled) return decisionPackage;
  if (!decisionPackage.itineraries || decisionPackage.itineraries.length < 2) return decisionPackage;

  try {
    const input: CandidateReviewInput = {
      tripSpec: spec,
      payload: {
        generatedAt: new Date().toISOString(),
        budgetSummary: {
          bestResortName: decisionPackage.budgetSummary.bestResortName,
          bestPerPersonTotal: decisionPackage.budgetSummary.bestPerPersonTotal,
          targetPerPerson: decisionPackage.budgetSummary.targetPerPerson,
          shortfallPerPerson: decisionPackage.budgetSummary.shortfallPerPerson,
          feasible: decisionPackage.budgetSummary.feasible,
          summaryLine: decisionPackage.budgetSummary.summaryLine
        },
        candidates: decisionPackage.itineraries.map((itinerary) => {
          const matrix = decisionPackage.decisionMatrix.find((row) => row.itineraryId === itinerary.id);
          const topLodging = itinerary.liveOptions?.lodging?.[0];
          return {
            itineraryId: itinerary.id,
            title: itinerary.title,
            resortName: itinerary.resortName,
            dates: itinerary.dateRange?.start && itinerary.dateRange?.end
              ? { start: itinerary.dateRange.start, end: itinerary.dateRange.end }
              : null,
            summary: itinerary.summary,
            budget: {
              perPersonTotal: itinerary.budgetEstimate?.perPersonTotal ?? null,
              targetPerPerson: itinerary.budgetEstimate?.targetPerPerson ?? null,
              shortfallPerPerson: itinerary.budgetEstimate?.shortfallPerPerson ?? null,
              components: itinerary.budgetEstimate?.components ?? {
                pass: 0,
                travel: 0,
                food: 0,
                gear_rental: 0,
                housing: 0
              }
            },
            // Keep the review payload compact and grounded to reduce LLM latency.
            matrix: {
              overallScore: matrix?.overallScore ?? 0.5,
              budgetFitScore: matrix?.budgetFitScore ?? 0.5,
              passFitScore: matrix?.passFitScore ?? 0.5,
              snowSkillScore: matrix?.snowSkillScore ?? 0.5,
              lodgingFitScore: matrix?.lodgingFitScore ?? 0.5,
              travelFitScore: matrix?.travelFitScore ?? 0.5
            },
            topLodging: topLodging
              ? {
                  name: topLodging.name,
                  source: topLodging.sourceMeta?.source ?? "estimated",
                  groupNightlyTotalUsd: topLodging.groupNightlyTotalUsd ?? null,
                  unitsNeededForGroup: topLodging.unitsNeededForGroup ?? null,
                  walkMinutesToLift: topLodging.walkMinutesToLift ?? null,
                  hotTub: topLodging.hotTub,
                  laundry: topLodging.laundry,
                  kitchen: topLodging.kitchen
                }
              : null
          };
        })
      }
    };

    const review = await withTimeout(
      llm.reviewItineraryCandidates(input),
      15000,
      "LLM itinerary review timed out; returning deterministic candidate ranking."
    );
    if (!review) return decisionPackage;
    return applyReview(decisionPackage, review);
  } catch {
    return decisionPackage;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function applyReview(
  decisionPackage: DecisionPackage,
  review: NonNullable<Awaited<ReturnType<LLMClient["reviewItineraryCandidates"]>>>
): DecisionPackage {
  const reviewById = new Map(review.itineraries.map((item) => [item.itineraryId, item]));
  const orderIndex = new Map(review.recommendedOrder.map((id, index) => [id, index]));

  const itineraries = decisionPackage.itineraries
    .map((itinerary) => {
      const item = reviewById.get(itinerary.id);
      return item
        ? {
            ...itinerary,
            aiReview: {
              rank: item.rank,
              verdict: item.verdict,
              rationale: item.rationale,
              tradeoffs: item.tradeoffs,
              confidence: item.confidence
            }
          }
        : itinerary;
    })
    .sort((a, b) => (orderIndex.get(a.id) ?? 999) - (orderIndex.get(b.id) ?? 999));

  const decisionMatrix = decisionPackage.decisionMatrix
    .slice()
    .sort((a, b) => (orderIndex.get(a.itineraryId) ?? 999) - (orderIndex.get(b.itineraryId) ?? 999));

  return {
    ...decisionPackage,
    itineraries,
    decisionMatrix,
    aiReview: {
      summary: review.summary,
      methodology: review.methodology,
      caveats: review.caveats,
      recommendedOrder: review.recommendedOrder
    }
  };
}
