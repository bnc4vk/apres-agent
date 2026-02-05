import dotenv from "dotenv";

dotenv.config();

export type LLMProvider = "mistral" | "stub";

export const llmProvider: LLMProvider = (process.env.LLM_PROVIDER as LLMProvider) ?? "mistral";

export const mistralApiKey = process.env.MISTRAL_API_KEY ?? "";
export const mistralLargeModel = process.env.MISTRAL_LARGE_MODEL ?? "mistral-large-latest";
export const mistralSmallModel = process.env.MISTRAL_SMALL_MODEL ?? "mistral-small-latest";

export function assertLLMConfig(): void {
  if (llmProvider === "mistral" && !mistralApiKey) {
    throw new Error("Missing MISTRAL_API_KEY. Set it in .env.");
  }
}

