import { LLMClient, SpecPatchInput } from "./client";
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
        notes: { passes: { noPassCount: 6, confirmed: true } },
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
        notes: { passes: { noPassCount: 4, confirmed: true } },
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

    if (message.includes("ikon") || message.includes("epic") || message.includes("indy") || message.includes("pass")) {
      return {
        notes: { passes: { notes: input.lastUserMessage, confirmed: true } }
      };
    }

    if (message.includes("no restrictions")) {
      return { travel: { confirmed: true } };
    }

    return {};
  }
}
