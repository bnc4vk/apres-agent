import { TripSpec } from "./tripSpec";

export function buildCarRentalNote(spec: TripSpec): string | null {
  const flyingLikely = spec.travel.noFlying === false || Boolean(spec.travel.arrivalAirport);
  if (!flyingLikely) return null;

  const airport = spec.travel.arrivalAirport ?? "your arrival airport";
  const links = [
    "https://www.google.com/travel/cars",
    "https://www.kayak.com/cars",
    "https://www.expedia.com/Cars"
  ];

  return `Car rental options near ${airport}: ${links.join(" | ")}. Winter note: prioritize AWD and carry chains when required.`;
}
