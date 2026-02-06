import { buildCarRentalNote } from "../../core/carRental";
import { DecisionPackage } from "../../core/decision";
import { TripSpec } from "../../core/tripSpec";

export function defaultQuestion(missingFields: string[]): string {
  const field = missingFields[0];
  switch (field) {
    case "traveler_pods":
      return 'Please share departure locations and headcount for each group (e.g., "3 from SF, 3 from Sacramento").';
    case "dates":
      return "What dates are you aiming for? A range like “Feb 20–23” works.";
    case "group_size":
      return "How many people are in the group?";
    case "skill_levels":
      return "What’s the skill level range (beginner/intermediate/advanced/expert)?";
    case "gear_rental":
      return "Do you need gear rentals for anyone in the group?";
    case "budget":
      return "What budget band should I plan for (low / mid / high)?";
    case "passes":
      return "How many people have Ikon, Epic, Indy, or no pass?";
    case "travel_restrictions":
      return "Any travel restrictions (no flying, max drive hours, avoid passes)?";
    case "location_input":
      return "Do you have a specific resort, a region/state, or should I suggest options?";
    default:
      return "Tell me a bit more about the trip.";
  }
}

export function buildDecisionSummary(
  spec: TripSpec,
  decision: DecisionPackage,
  generationNote?: string | null
): string {
  const dates = spec.dates.start && spec.dates.end ? `${spec.dates.start} to ${spec.dates.end}` : "TBD";
  const group = spec.group.size ? `${spec.group.size} people` : "your group";
  const resortLine =
    decision.resortShortlist.length > 0
      ? `Top resort matches: ${decision.resortShortlist.join(", ")}.`
      : "No resort matches found in the current dataset.";

  const itineraryLines = decision.itineraries
    .map((itinerary) => {
      const budget = itinerary.lodgingBudgetPerPerson
        ? `Lodging target: ~$${itinerary.lodgingBudgetPerPerson} pp.`
        : "Lodging budget: flexible.";
      return `- ${itinerary.title}: ${itinerary.summary} ${budget}`;
    })
    .join("\n");

  const extras = [
    decision.budgetSummary.summaryLine,
    buildPoiSummary(decision),
    buildCarRentalNote(spec),
    "Planning links are organized in the itinerary cards (Lodging, Gear, Grocery, Takeout, Cars).",
    "Use the “Export to Google Sheets” button when you’re ready for a shareable plan."
  ]
    .filter(Boolean)
    .join("\n");

  const header = generationNote
    ? `${generationNote}\n\nI’ve got enough to build itineraries for ${group} on ${dates}.`
    : `I’ve got enough to build itineraries for ${group} on ${dates}.`;

  return `${header}\n${resortLine}\n\nHere are 2–3 options:\n${itineraryLines}\n\n${extras}`;
}

function buildPoiSummary(decision: DecisionPackage): string {
  const gear = decision.poiResults.gearShops[0];
  const grocery = decision.poiResults.groceries[0];
  const restaurant = decision.poiResults.restaurants[0];
  return `Nearby picks: Gear — ${gear.name} (${gear.hours}); Grocery — ${grocery.name}; Restaurant — ${restaurant.name}.`;
}
