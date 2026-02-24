import { LLMClient } from "./client";
import { getAppContainer } from "../runtime/appContainer";

export function getLLMClient(): LLMClient {
  return getAppContainer().getLLMClient();
}
