import { ChatMessage } from "./types";
import { TripSpec, TripSpecPatch } from "../core/tripSpec";

export type SpecPatchInput = {
  tripSpec: TripSpec;
  messages: ChatMessage[];
  lastUserMessage: string;
};

export type FollowupQuestionInput = {
  tripSpec: TripSpec;
  messages: ChatMessage[];
  missingFields: string[];
};

export type FollowupQuestionOutput = {
  acknowledgement: string;
  question: string;
  askedFields: string[];
};

export type LLMClient = {
  generateTripSpecPatch(input: SpecPatchInput): Promise<TripSpecPatch>;
  generateFollowupQuestion(input: FollowupQuestionInput): Promise<FollowupQuestionOutput>;
};
