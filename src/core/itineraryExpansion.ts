import dayjs from "dayjs";
import { TripSpec } from "./tripSpec";
import { Itinerary } from "./itinerary";
import { POIResults } from "./poi";

export function expandItinerary(
  spec: TripSpec,
  itinerary: Itinerary,
  poiResults: POIResults
): string {
  const start = itinerary.dateRange?.start ? dayjs(itinerary.dateRange.start) : null;
  const end = itinerary.dateRange?.end ? dayjs(itinerary.dateRange.end) : null;
  const tripLength =
    spec.dates.tripLengthDays ??
    (start && end ? Math.max(1, end.diff(start, "day") + 1) : 3);
  const gearShop = poiResults.gearShops[0]?.name ?? "a nearby gear shop";
  const grocery = poiResults.groceries[0]?.name ?? "a nearby grocery";
  const restaurant = poiResults.restaurants[0]?.name ?? "a nearby restaurant";

  const days: string[] = [];
  for (let i = 0; i < tripLength; i += 1) {
    const label = start ? start.add(i, "day").format("YYYY-MM-DD") : `Day ${i + 1}`;
    const dayHeader = `Day ${i + 1} — ${label}`;
    const blocks = [];
    if (i === 0) {
      blocks.push(`Arrive, check in near ${itinerary.lodgingArea}.`);
      if (spec.gear.rentalRequired) {
        blocks.push(`Pick up rentals at ${gearShop}.`);
      }
      blocks.push(`Grocery stop at ${grocery} for snacks + breakfast.`);
    } else {
      blocks.push("Morning warm-up runs + lesson time for beginners.");
    }
    blocks.push("Midday break + lunch on mountain.");
    blocks.push(`Dinner at ${restaurant} or a similar spot.`);
    days.push(`${dayHeader}\n- ${blocks.join("\n- ")}`);
  }

  return [
    `${itinerary.title}`,
    `Dates: ${itinerary.dateRange?.label ?? "TBD"}`,
    `Lodging: ${itinerary.lodgingArea}`,
    "",
    days.join("\n\n")
  ].join("\n");
}
