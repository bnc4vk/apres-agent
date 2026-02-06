import { ChatMessage } from "./types";
import { TripSpec, TripSpecPatch } from "../core/tripSpec";

export type SpecPatchInput = {
  tripSpec: TripSpec;
  messages: ChatMessage[];
  lastUserMessage: string;
};

export type LLMClient = {
  generateTripSpecPatch(input: SpecPatchInput): Promise<TripSpecPatch>;
};
