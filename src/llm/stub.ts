import { LLMClient, FollowupQuestionInput, FollowupQuestionOutput, SpecPatchInput } from "./client";
import { TripSpecPatch } from "../core/tripSpec";

export class StubLLMClient implements LLMClient {
  async generateTripSpecPatch(input: SpecPatchInput): Promise<TripSpecPatch> {
    const message = input.lastUserMessage.toLowerCase();

    if (message.includes("we are 6") || message.includes("6 people")) {
      return {
        group: { size: 6, skillLevels: ["beginner", "intermediate"] },
        dates: { start: "2026-02-20", end: "2026-02-23", kind: "exact", yearConfirmed: true },
        gear: { rentalRequired: true, confirmed: true },
        budget: { band: "mid", confirmed: true },
        travel: { noFlying: true, maxDriveHours: 4, confirmed: true },
        location: { openToSuggestions: true, confirmed: true }
      };
    }
    if (message.includes("we are 4") || message.includes("4 people")) {
      return {
        group: { size: 4, skillLevels: ["beginner"] },
        dates: { start: "2026-02-20", end: "2026-02-23", kind: "exact", yearConfirmed: true },
        gear: { rentalRequired: true, confirmed: true },
        budget: { band: "mid", confirmed: true },
        travel: { noFlying: true, maxDriveHours: 4, confirmed: true },
        location: { openToSuggestions: true, confirmed: true }
      };
    }

    if (message.includes("3 from sf")) {
      return {
        travelers: { pods: [{ origin: "SF", count: 3 }, { origin: "Sacramento", count: 3 }] }
      };
    }

    if (message.includes("suggest") && message.includes("options")) {
      return { location: { openToSuggestions: true, confirmed: true } };
    }

    if (message.includes("no restrictions")) {
      return { travel: { confirmed: true } };
    }

    return {};
  }

  async generateFollowupQuestion(input: FollowupQuestionInput): Promise<FollowupQuestionOutput> {
    if (input.missingFields.includes("traveler_pods")) {
      return {
        acknowledgement: "Got it.",
        question: 'Please share departure locations and headcount for each group (e.g., "3 from SF, 3 from Sacramento").',
        askedFields: ["traveler_pods"]
      };
    }
    if (input.missingFields.includes("dates")) {
      return { acknowledgement: "Got it.", question: "What dates are you aiming for?", askedFields: ["dates"] };
    }
    if (input.missingFields.includes("location_input")) {
      return {
        acknowledgement: "Got it.",
        question: "Do you want me to suggest resorts, or do you have a region/state in mind?",
        askedFields: ["location_input"]
      };
    }
    return { acknowledgement: "Got it.", question: "What else should I know about the trip?", askedFields: input.missingFields.slice(0, 1) };
  }
}
