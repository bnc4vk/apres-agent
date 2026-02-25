import { TripSpec } from "../core/tripSpec";

export type CandidateReviewInput = {
  tripSpec: TripSpec;
  payload: {
    generatedAt: string;
    budgetSummary: {
      bestResortName: string | null;
      bestPerPersonTotal: number;
      targetPerPerson: number | null;
      shortfallPerPerson: number;
      feasible: boolean;
      summaryLine: string;
    };
    candidates: Array<{
      itineraryId: string;
      title: string;
      resortName: string;
      dates: { start: string; end: string } | null;
      summary: string;
      budget: {
        perPersonTotal: number | null;
        targetPerPerson: number | null;
        shortfallPerPerson: number | null;
        components: Record<"pass" | "travel" | "food" | "gear_rental" | "housing", number>;
      };
      matrix: {
        overallScore: number;
        budgetFitScore: number;
        passFitScore: number;
        snowSkillScore: number;
        lodgingFitScore: number;
        travelFitScore: number;
      };
      topLodging: {
        name: string;
        source: string;
        groupNightlyTotalUsd: number | null;
        unitsNeededForGroup: number | null;
        walkMinutesToLift: number | null;
        hotTub: boolean;
        laundry: boolean;
        kitchen: boolean;
      } | null;
    }>;
  };
};

export type CandidateReviewItinerary = {
  itineraryId: string;
  rank: number;
  verdict: "best_overall" | "best_value" | "best_pass_fit" | "best_snow_skill" | "high_convenience" | "backup";
  rationale: string;
  tradeoffs: string[];
  confidence: number;
};

export type CandidateReviewResult = {
  summary: string;
  methodology: string;
  recommendedOrder: string[];
  itineraries: CandidateReviewItinerary[];
  caveats: string[];
};

export type LLMClient = {
  reviewItineraryCandidates(input: CandidateReviewInput): Promise<CandidateReviewResult | null>;
};
