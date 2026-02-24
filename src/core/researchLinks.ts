import { TripSpec } from "./tripSpec";
import { findResortByName } from "./resorts";

export type ResearchLinks = {
  lodgingSearch: string;
  airbnbSearch: string;
  vrboSearch: string;
  carRentalCompare: string | null;
  gearSearch: string;
  grocerySearch: string;
  takeoutSearch: string;
};

export function buildResearchLinks(
  spec: TripSpec,
  resortName: string,
  lodgingNightlyCap?: number | null
): ResearchLinks {
  const resort = findResortByName(resortName);
  const locationPhrase = [resort?.name ?? resortName, resort?.state ?? ""].filter(Boolean).join(", ");
  const dates = `${spec.dates.start ?? ""} to ${spec.dates.end ?? ""}`.trim();
  const lodgingBudgetHint =
    typeof lodgingNightlyCap === "number" && lodgingNightlyCap > 0
      ? ` under $${lodgingNightlyCap} per night`
      : "";
  const amenityHints = [
    spec.lodgingConstraints.hotTubRequired ? "hot tub" : "",
    spec.lodgingConstraints.laundryRequired ? "laundry" : "",
    spec.lodgingConstraints.kitchenRequired ? "kitchen" : "",
    typeof spec.lodgingConstraints.maxWalkMinutesToLift === "number"
      ? `walk to lift ${spec.lodgingConstraints.maxWalkMinutesToLift} min`
      : ""
  ]
    .filter(Boolean)
    .join(" ");
  const lodgingQuery = encodeURIComponent(`${resortName} lodging ${dates}${lodgingBudgetHint} ${amenityHints}`.trim());
  const gearQuery = encodeURIComponent(`ski rental near ${locationPhrase} ski resort`);
  const groceryQuery = encodeURIComponent(`grocery store near ${locationPhrase} ski resort`);
  const diningHints = [
    spec.diningConstraints.mustSupportTakeout ? "takeout" : "",
    spec.diningConstraints.mustBeReservable ? "reservable" : "",
    typeof spec.diningConstraints.minGroupCapacity === "number"
      ? `${spec.diningConstraints.minGroupCapacity}+ people`
      : ""
  ]
    .filter(Boolean)
    .join(" ");
  const takeoutQuery = encodeURIComponent(`restaurants near ${locationPhrase} ski resort ${diningHints}`.trim());
  const airport = spec.travel.arrivalAirport?.trim();
  const carQuery = encodeURIComponent(`${airport ? `${airport} airport` : locationPhrase} car rental ${dates}`.trim());
  const guestCount = spec.group.size ?? 4;
  const airbnbQuery = new URLSearchParams({
    query: `${resortName}`,
    adults: String(Math.max(1, guestCount)),
    check_in: spec.dates.start ?? "",
    check_out: spec.dates.end ?? ""
  });
  const vrboQuery = encodeURIComponent(`${resortName} vacation rental ${dates} ${guestCount} guests`);

  return {
    lodgingSearch: `https://www.google.com/travel/hotels?q=${lodgingQuery}`,
    airbnbSearch: `https://www.airbnb.com/s/${encodeURIComponent(resortName)}/homes?${airbnbQuery.toString()}`,
    vrboSearch: `https://www.vrbo.com/search/keywords:${vrboQuery}`,
    carRentalCompare: shouldCompareCars(spec)
      ? `https://www.google.com/maps/search/?api=1&query=${carQuery}`
      : null,
    gearSearch: `https://www.google.com/maps/search/?api=1&query=${gearQuery}`,
    grocerySearch: `https://www.google.com/maps/search/?api=1&query=${groceryQuery}`,
    takeoutSearch: `https://www.google.com/maps/search/?api=1&query=${takeoutQuery}`
  };
}

function shouldCompareCars(spec: TripSpec): boolean {
  return spec.travel.noFlying === false || Boolean(spec.travel.arrivalAirport);
}
