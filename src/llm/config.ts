import dotenv from "dotenv";

dotenv.config();

export type LLMProvider = "mistral" | "openai" | "stub";
export type LLMProfile = "mistral_free" | "mistral_paid" | "openai_sota" | "stub";

export const llmProfile: LLMProfile =
  (process.env.LLM_PROFILE as LLMProfile) ??
  ((process.env.LLM_PROVIDER as LLMProvider | undefined) === "stub" ? "stub" : "mistral_paid");

export const llmProvider: LLMProvider =
  llmProfile === "stub"
    ? "stub"
    : llmProfile.startsWith("openai")
      ? "openai"
      : "mistral";

export const mistralApiKey = process.env.MISTRAL_API_KEY ?? "";
export const openaiApiKey = process.env.OPENAI_API_KEY ?? "";

const defaultMistralFreeModel = process.env.MISTRAL_FREE_MODEL ?? "mistral-small-latest";
const defaultMistralPaidModel = process.env.MISTRAL_PAID_MODEL ?? process.env.MISTRAL_LARGE_MODEL ?? "mistral-large-latest";
const defaultOpenAISotaModel = process.env.OPENAI_SOTA_MODEL ?? "gpt-5";

export const llmModelName =
  llmProfile === "mistral_free"
    ? defaultMistralFreeModel
    : llmProfile === "mistral_paid"
      ? defaultMistralPaidModel
      : llmProfile === "openai_sota"
        ? defaultOpenAISotaModel
        : process.env.LLM_MODEL ?? defaultMistralPaidModel;

export const mistralModelName = llmProvider === "mistral" ? llmModelName : defaultMistralPaidModel;
export const openaiModelName = llmProvider === "openai" ? llmModelName : defaultOpenAISotaModel;

export const llmReasoningReviewEnabled = envFlag("LLM_REASONING_REVIEW_ENABLED", true);

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return defaultValue;
}

export function assertLLMConfig(): void {
  if (llmProvider === "mistral" && !mistralApiKey) {
    throw new Error("Missing MISTRAL_API_KEY. Set it in .env.");
  }
  if (llmProvider === "openai" && !openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY. Set it in .env.");
  }
}
