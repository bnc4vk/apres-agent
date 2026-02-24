import { LLMClient } from "./client";
import { getAppContainer } from "../runtime/appContainer";
import { LLMProfile, mistralApiKey, openaiApiKey } from "./config";
import { MistralLLMClient } from "./mistral";
import { OpenAILLMClient } from "./openai";
import { StubLLMClient } from "./stub";

export function getLLMClient(): LLMClient {
  return getAppContainer().getLLMClient();
}

export function createLLMClientForProfile(profile: LLMProfile): LLMClient {
  if (profile === "stub") return new StubLLMClient();
  if (profile === "openai_sota") {
    if (!openaiApiKey) {
      throw new Error("Missing OPENAI_API_KEY. Set it before running with LLM_PROFILE=openai_sota.");
    }
    const model = process.env.OPENAI_SOTA_MODEL ?? "gpt-5";
    return new OpenAILLMClient(openaiApiKey, model);
  }
  if (!mistralApiKey) {
    throw new Error("Missing MISTRAL_API_KEY. Set it before running with a Mistral LLM profile.");
  }
  if (profile === "mistral_free") {
    const model = process.env.MISTRAL_FREE_MODEL ?? "mistral-small-latest";
    return new MistralLLMClient(mistralApiKey, model);
  }
  const model = process.env.MISTRAL_PAID_MODEL ?? process.env.MISTRAL_LARGE_MODEL ?? "mistral-large-latest";
  return new MistralLLMClient(mistralApiKey, model);
}
