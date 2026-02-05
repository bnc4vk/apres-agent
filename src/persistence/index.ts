import { appConfig } from "../config/appConfig";
import { ConversationStore } from "./store";
import { SupabaseConversationStore } from "./supabaseStore";
import { MemoryConversationStore } from "./memoryStore";

let store: ConversationStore | null = null;

export function getConversationStore(): ConversationStore {
  if (store) return store;
  if (appConfig.persistenceDriver === "memory") {
    store = new MemoryConversationStore();
  } else {
    store = new SupabaseConversationStore();
  }
  return store;
}
