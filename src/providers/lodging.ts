import dayjs from "dayjs";
import { searchBookingLodging } from "../integrations/bookingDemand";
import { LodgingOption, buildSourceMeta } from "../core/supply";
import { LodgingProvider, LodgingSearchRequest } from "./types";

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE = new Map<string, { expiresAt: number; value: LodgingOption[] }>();

export class BookingDemandLodgingProvider implements LodgingProvider {
  async search(request: LodgingSearchRequest): Promise<LodgingOption[]> {
    const cacheKey = [
      request.resortName,
      request.checkInDate,
      request.checkOutDate,
      request.nightlyBudgetCapUsd ?? "none"
    ].join("|");
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const groupSize = request.spec.group.size ?? 4;
    const rooms = Math.max(1, Math.ceil(groupSize / 2.2));
    const live = await searchBookingLodging({
      destination: request.resortName,
      checkInDate: request.checkInDate,
      checkOutDate: request.checkOutDate,
      adults: groupSize,
      rooms,
      maxNightlyUsd: request.nightlyBudgetCapUsd
    });

    const result =
      live && live.length > 0
        ? live.map((option) => ({
            id: option.id,
            name: option.name,
            nightlyRateUsd: option.nightlyRateUsd,
            totalEstimateUsd: totalEstimate(option.nightlyRateUsd, request.checkInDate, request.checkOutDate),
            bedrooms: option.bedrooms,
            walkMinutesToLift: option.walkMinutesToLift,
            hotTub: option.hotTub,
            laundry: option.laundry,
            kitchen: option.kitchen,
            bookingUrl: option.bookingUrl,
            sourceMeta: buildSourceMeta("live", 0.82)
          }))
        : buildEstimatedLodging(request);

    CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
    return applyLodgingFilters(result, request);
  }
}

function buildEstimatedLodging(request: LodgingSearchRequest): LodgingOption[] {
  const base = request.nightlyBudgetCapUsd ?? 320;
  const style = request.spec.groupComposition.roomingStyle ?? "hybrid";
  const bedrooms = request.spec.lodgingConstraints.minBedrooms ?? (style === "couples" ? 4 : 3);
  return [
    {
      id: "est-1",
      name: `${request.resortName} Village Condo`,
      nightlyRateUsd: Math.round(base * 0.92),
      totalEstimateUsd: totalEstimate(Math.round(base * 0.92), request.checkInDate, request.checkOutDate),
      bedrooms,
      walkMinutesToLift: 8,
      hotTub: true,
      laundry: true,
      kitchen: true,
      bookingUrl: null,
      sourceMeta: buildSourceMeta("estimated", 0.58)
    },
    {
      id: "est-2",
      name: `${request.resortName} Lodge Suites`,
      nightlyRateUsd: Math.round(base * 1.05),
      totalEstimateUsd: totalEstimate(Math.round(base * 1.05), request.checkInDate, request.checkOutDate),
      bedrooms: Math.max(2, bedrooms - 1),
      walkMinutesToLift: 15,
      hotTub: true,
      laundry: false,
      kitchen: false,
      bookingUrl: null,
      sourceMeta: buildSourceMeta("estimated", 0.56)
    }
  ];
}

function applyLodgingFilters(options: LodgingOption[], request: LodgingSearchRequest): LodgingOption[] {
  const constraints = request.spec.lodgingConstraints;
  const hard = constraints.constraintMode === "hard";

  if (!hard) return options;

  return options.filter((option) => {
    if (typeof constraints.maxWalkMinutesToLift === "number") {
      if (typeof option.walkMinutesToLift === "number" && option.walkMinutesToLift > constraints.maxWalkMinutesToLift) {
        return false;
      }
    }
    if (constraints.hotTubRequired && !option.hotTub) return false;
    if (constraints.laundryRequired && !option.laundry) return false;
    if (constraints.kitchenRequired && !option.kitchen) return false;
    if (typeof constraints.minBedrooms === "number" && option.bedrooms < constraints.minBedrooms) return false;
    return true;
  });
}

function totalEstimate(nightlyRateUsd: number, checkInDate: string, checkOutDate: string): number {
  const inDate = dayjs(checkInDate);
  const outDate = dayjs(checkOutDate);
  if (!inDate.isValid() || !outDate.isValid()) return nightlyRateUsd * 2;
  const nights = Math.max(1, outDate.diff(inDate, "day"));
  return Math.round(nightlyRateUsd * nights);
}
