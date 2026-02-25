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
  const lodging = itinerary.liveOptions?.lodging?.[0];
  const car = itinerary.liveOptions?.cars?.[0];

  const days: string[] = [];
  for (let i = 0; i < tripLength; i += 1) {
    const label = start ? start.add(i, "day").format("YYYY-MM-DD") : `Day ${i + 1}`;
    const dayHeader = `Day ${i + 1} — ${label}`;
    const blocks = [];
    const isFirstDay = i === 0;
    const isLastDay = i === tripLength - 1;
    const isSingleDayTrip = tripLength === 1;

    if (isLastDay && !isSingleDayTrip) {
      blocks.push("Breakfast, pack up, and check out.");
      if (spec.gear.rentalRequired) {
        blocks.push(`Return rentals at ${gearShop} before departure.`);
      }
      if (spec.travel.noFlying) {
        blocks.push("Drive home / onward to the next stop.");
      } else {
        blocks.push("Airport transfer, rental-car return, and departure buffer.");
      }
      days.push(`${dayHeader}\n- ${blocks.join("\n- ")}`);
      continue;
    }

    if (isFirstDay) {
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
    lodging
      ? `Suggested stay: ${lodging.name} (~$${lodging.nightlyRateUsd}/night, source: ${lodging.sourceMeta.source})`
      : "Suggested stay: use itinerary lodging links to confirm current availability.",
    car
      ? `Suggested car: ${car.provider} ${car.vehicleClass} (~$${car.totalPriceUsd} total, source: ${car.sourceMeta.source})`
      : "",
    "",
    days.join("\n\n")
  ].join("\n");
}
