import { TripSpec } from "./tripSpec";

export function buildCarRentalNote(spec: TripSpec): string | null {
  const flyingLikely = spec.travel.noFlying === false || Boolean(spec.travel.arrivalAirport);
  if (!flyingLikely) return null;

  const airport = spec.travel.arrivalAirport ?? "your arrival airport";
  return `Car rental is likely for arrivals near ${airport}. Winter note: prioritize AWD and carry chains when required.`;
}
