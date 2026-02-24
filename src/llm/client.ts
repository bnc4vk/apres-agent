import { ChatMessage } from "./types";
import { PendingSpecAssumption, TripSpec, TripSpecPatch } from "../core/tripSpec";

export type SpecPatchInput = {
  tripSpec: TripSpec;
  messages: ChatMessage[];
  lastUserMessage: string;
};

export type ExtractedFieldState = {
  path: string;
  confidence: number;
  evidence: string;
};

export type ExtractionAssumption = {
  path: string;
  rationale: string;
  confidence: number;
};

export type SpecExtractionResult = {
  patch: TripSpecPatch;
  fieldStates: ExtractedFieldState[];
  unresolvedPaths: string[];
  clarifyingQuestions: string[];
  assumptions: ExtractionAssumption[];
};

export type AssumptionResolutionInput = SpecPatchInput & {
  pendingAssumptions: PendingSpecAssumption[];
};

export type AssumptionResolutionResult = {
  acceptedIds: string[];
  rejectedIds: string[];
  unsureIds: string[];
};

export type LLMClient = {
  extractTripSpec(input: SpecPatchInput): Promise<SpecExtractionResult>;
  resolveAssumptions(input: AssumptionResolutionInput): Promise<AssumptionResolutionResult>;
};
