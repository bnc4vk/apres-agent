import { buildCarRentalNote } from "../../core/carRental";
import { DecisionPackage } from "../../core/decision";
import { TripSpec } from "../../core/tripSpec";

export function defaultQuestion(missingFields: string[]): string {
  const field = missingFields[0];
  switch (field) {
    case "traveler_pods":
      return 'Please share departure locations and headcount for each group (e.g., "3 from SF, 3 from Sacramento").';
    case "lodging_constraints":
      return "Any hard lodging constraints (walk-to-lift minutes, hot tub, laundry, bedroom count, kitchen)?";
    case "dining_constraints":
      return "Any hard dining constraints (takeout required, reservable, minimum group seating)?";
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
  const noFeasibleLodgingForHardConstraints =
    spec.lodgingConstraints.constraintMode === "hard" &&
    decision.itineraries.every((itinerary) => (itinerary.liveOptions?.lodging?.length ?? 0) === 0);
  const optionsBlock =
    decision.itineraries.length > 0 && !noFeasibleLodgingForHardConstraints
      ? `Here are 2–3 options:\n${itineraryLines}`
      : "No feasible options were found for the current hard constraints. Try relaxing one constraint and refresh.";

  const extras = [
    decision.budgetSummary.summaryLine,
    buildSourceSummary(decision),
    buildPoiSummary(decision),
    buildCarRentalNote(spec),
    buildOpsSummary(decision),
    "Planning links are organized in the itinerary cards (Lodging, Gear, Grocery, Takeout, Cars).",
    "Use the “Export to Google Sheets” button when you’re ready for a shareable plan."
  ]
    .filter(Boolean)
    .join("\n");

  const header = generationNote
    ? `${generationNote}\n\nI’ve got enough to build itineraries for ${group} on ${dates}.`
    : `I’ve got enough to build itineraries for ${group} on ${dates}.`;

  return `${header}\n${resortLine}\n\n${optionsBlock}\n\n${extras}`;
}

function buildPoiSummary(decision: DecisionPackage): string {
  const gear = decision.poiResults.gearShops[0];
  const grocery = decision.poiResults.groceries[0];
  const restaurant = decision.poiResults.restaurants[0];
  if (!gear || !grocery || !restaurant) {
    return "Nearby picks are still loading; open itinerary links for vendor search.";
  }
  const diningFlags = [
    restaurant.supportsTakeout ? "takeout" : null,
    restaurant.reservable ? "reservable" : null
  ]
    .filter(Boolean)
    .join(", ");
  return `Nearby picks: Gear — ${gear.name} (${gear.hours}); Grocery — ${grocery.name}; Restaurant — ${restaurant.name}${diningFlags ? ` (${diningFlags})` : ""}.`;
}

function buildSourceSummary(decision: DecisionPackage): string {
  const lodgingSource = decision.itineraries[0]?.liveOptions?.lodging[0]?.sourceMeta.source ?? "estimated";
  const carSource = decision.itineraries[0]?.liveOptions?.cars[0]?.sourceMeta.source ?? "estimated";
  const poiSource = decision.poiResults.restaurants[0]?.sourceMeta.source ?? "estimated";
  return `Data quality: Lodging ${lodgingSource}, Cars ${carSource}, POIs ${poiSource}.`;
}

function buildOpsSummary(decision: DecisionPackage): string {
  const taskCount = decision.opsBoard.tasks.length;
  const chat = decision.opsBoard.chatBootstrap.enabled ? "enabled" : "off";
  const splitwise = decision.opsBoard.splitwiseBootstrap.enabled ? "enabled" : "off";
  return `Ops board: ${taskCount} tasks created. Group chat bootstrap ${chat}. Splitwise bootstrap ${splitwise}.`;
}
