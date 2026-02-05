import { assertLLMConfig, llmProvider } from "./config";
import { LLMClient } from "./client";
import { MistralLLMClient } from "./mistral";
import { StubLLMClient } from "./stub";

let singleton: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (singleton) return singleton;

  if (llmProvider === "stub") {
    singleton = new StubLLMClient();
    return singleton;
  }

  assertLLMConfig();
  singleton = new MistralLLMClient();
  return singleton;
}

