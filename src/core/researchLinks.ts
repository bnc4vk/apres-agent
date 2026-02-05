import { TripSpec } from "./tripSpec";

export type ResearchLinks = {
  lodgingSearch: string;
  carRentalCompare: string | null;
  gearSearch: string;
  grocerySearch: string;
  takeoutSearch: string;
};

export function buildResearchLinks(spec: TripSpec, resortName: string): ResearchLinks {
  const dates = `${spec.dates.start ?? ""} to ${spec.dates.end ?? ""}`.trim();
  const lodgingQuery = encodeURIComponent(`${resortName} lodging ${dates}`);
  const gearQuery = encodeURIComponent(`ski rental near ${resortName}`);
  const groceryQuery = encodeURIComponent(`grocery store near ${resortName}`);
  const takeoutQuery = encodeURIComponent(`takeout restaurants near ${resortName}`);
  const airport = spec.travel.arrivalAirport?.trim();
  const carQuery = encodeURIComponent(`${airport ?? resortName} car rental ${dates}`);

  return {
    lodgingSearch: `https://www.google.com/travel/hotels?q=${lodgingQuery}`,
    carRentalCompare: shouldCompareCars(spec)
      ? `https://www.google.com/travel/cars?qs=${carQuery}`
      : null,
    gearSearch: `https://www.google.com/maps/search/?api=1&query=${gearQuery}`,
    grocerySearch: `https://www.google.com/maps/search/?api=1&query=${groceryQuery}`,
    takeoutSearch: `https://www.google.com/maps/search/?api=1&query=${takeoutQuery}`
  };
}

function shouldCompareCars(spec: TripSpec): boolean {
  return spec.travel.noFlying === false || Boolean(spec.travel.arrivalAirport);
}
