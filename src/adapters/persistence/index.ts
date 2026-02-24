import { ConversationStore } from "./store";
import { getAppContainer } from "../../runtime/appContainer";

export function getConversationStore(): ConversationStore {
  return getAppContainer().getConversationStore();
}
