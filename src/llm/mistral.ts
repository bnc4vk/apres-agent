import { Mistral } from "@mistralai/mistralai";
import { CandidateReviewInput, CandidateReviewResult, LLMClient } from "./client";
import { mistralApiKey, mistralModelName } from "./config";
import {
  buildCandidateReviewPrompt,
  CandidateReviewSchema,
  CANDIDATE_REVIEW_SYSTEM_PROMPT,
  sanitizeCandidateReview
} from "./candidateReview";

export class MistralLLMClient implements LLMClient {
  private mistral: Mistral;

  constructor(apiKey = mistralApiKey, private readonly modelName = mistralModelName) {
    this.mistral = new Mistral({ apiKey });
  }

  async reviewItineraryCandidates(input: CandidateReviewInput): Promise<CandidateReviewResult | null> {
    try {
      const response = await this.mistral.chat.parse(
        {
          model: this.modelName,
          messages: [
            { role: "system", content: CANDIDATE_REVIEW_SYSTEM_PROMPT },
            { role: "user", content: buildCandidateReviewPrompt(input) }
          ],
          responseFormat: CandidateReviewSchema,
          temperature: 0.15
        },
        {}
      );
      const parsed = response.choices?.[0]?.message?.parsed;
      if (!parsed) return null;
      return sanitizeCandidateReview(parsed, input.payload.candidates.map((candidate) => candidate.itineraryId));
    } catch {
      return null;
    }
  }
}
