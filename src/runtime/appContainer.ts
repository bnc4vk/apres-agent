import { appConfig } from "../config/appConfig";
import { ConversationStore } from "../adapters/persistence/store";
import { MemoryConversationStore } from "../adapters/persistence/memoryStore";
import { SupabaseConversationStore } from "../adapters/persistence/supabaseStore";
import { CarProvider, LodgingProvider, PoiProvider } from "../adapters/providers/types";
import { BookingDemandCarProvider } from "../adapters/providers/car";
import { BookingDemandLodgingProvider } from "../adapters/providers/lodging";
import { GooglePlacesPoiProvider } from "../adapters/providers/poi";
import { assertLLMConfig, llmProvider } from "../llm/config";
import { LLMClient } from "../llm/client";
import { MistralLLMClient } from "../llm/mistral";
import { StubLLMClient } from "../llm/stub";

export class AppContainer {
  private conversationStore: ConversationStore | null = null;
  private lodgingProvider: LodgingProvider | null = null;
  private carProvider: CarProvider | null = null;
  private poiProvider: PoiProvider | null = null;
  private llmClient: LLMClient | null = null;

  getConversationStore(): ConversationStore {
    if (!this.conversationStore) {
      this.conversationStore =
        appConfig.persistenceDriver === "memory"
          ? new MemoryConversationStore()
          : new SupabaseConversationStore();
    }
    return this.conversationStore;
  }

  getLodgingProvider(): LodgingProvider {
    if (!this.lodgingProvider) {
      this.lodgingProvider = new BookingDemandLodgingProvider();
    }
    return this.lodgingProvider;
  }

  getCarProvider(): CarProvider {
    if (!this.carProvider) {
      this.carProvider = new BookingDemandCarProvider();
    }
    return this.carProvider;
  }

  getPoiProvider(): PoiProvider {
    if (!this.poiProvider) {
      this.poiProvider = new GooglePlacesPoiProvider();
    }
    return this.poiProvider;
  }

  getLLMClient(): LLMClient {
    if (!this.llmClient) {
      if (llmProvider === "stub") {
        this.llmClient = new StubLLMClient();
      } else {
        assertLLMConfig();
        this.llmClient = new MistralLLMClient();
      }
    }
    return this.llmClient;
  }
}

let container: AppContainer | null = null;

export function getAppContainer(): AppContainer {
  if (!container) {
    container = new AppContainer();
  }
  return container;
}
