import dayjs from "dayjs";
import { searchBookingLodging } from "../integrations/bookingDemand";
import { searchPlacesText } from "../integrations/googlePlacesV1";
import { LodgingOption, buildSourceMeta } from "../../core/supply";
import { LodgingProvider, LodgingSearchRequest } from "./types";
import { CachedProviderBase } from "./cachedProviderBase";
import { findResortByName } from "../../core/resorts";

export class BookingDemandLodgingProvider
  extends CachedProviderBase<LodgingSearchRequest, LodgingOption[], LodgingOption[]>
  implements LodgingProvider
{
  protected readonly cacheTtlMs = 30 * 60 * 1000;

  protected cacheKey(request: LodgingSearchRequest): string {
    return [
      request.resortName,
      request.checkInDate,
      request.checkOutDate,
      request.nightlyBudgetCapUsd ?? "none"
    ].join("|");
  }

  protected async loadFresh(request: LodgingSearchRequest): Promise<LodgingOption[]> {
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
        ? live.map((option) =>
            enrichForGroup(
              {
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
              },
              request
            )
          )
        : await buildFallbackLodging(request);
    return rankLodgingOptions(result, request);
  }

  protected project(cached: LodgingOption[], request: LodgingSearchRequest): LodgingOption[] {
    return applyLodgingFilters(cached, request);
  }
}

async function buildFallbackLodging(request: LodgingSearchRequest): Promise<LodgingOption[]> {
  const places = await buildPlacesBackedLodging(request);
  if (places.length > 0) return places;
  return buildEstimatedLodging(request);
}

function buildEstimatedLodging(request: LodgingSearchRequest): LodgingOption[] {
  const base = request.nightlyBudgetCapUsd ?? 320;
  const style = request.spec.groupComposition.roomingStyle ?? "hybrid";
  const bedrooms = request.spec.lodgingConstraints.minBedrooms ?? (style === "couples" ? 4 : 3);
  return [
    enrichForGroup({
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
    }, request),
    enrichForGroup({
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
    }, request)
  ];
}

async function buildPlacesBackedLodging(request: LodgingSearchRequest): Promise<LodgingOption[]> {
  const resort = findResortByName(request.resortName);
  if (!resort) return [];

  const places = await searchPlacesText({
    query: `hotel or condo near ${resort.name} ski resort`,
    latitude: resort.lat,
    longitude: resort.lng
  });
  if (!places || places.length === 0) return [];

  const base = request.nightlyBudgetCapUsd ?? 320;
  const minBedrooms = request.spec.lodgingConstraints.minBedrooms ?? defaultBedrooms(request);
  const style = request.spec.groupComposition.roomingStyle ?? "hybrid";

  return places.slice(0, 4).map((place, index) => {
    const name = place.name;
    const inferred = inferPropertyTraits(name, style, minBedrooms);
    const distanceMiles =
      typeof place.latitude === "number" && typeof place.longitude === "number"
        ? haversineMiles(resort.lat, resort.lng, place.latitude, place.longitude)
        : null;
    const walkMinutesToLift =
      typeof distanceMiles === "number" ? Math.max(2, Math.min(45, Math.round(distanceMiles * 22))) : null;
    const nightlyRateUsd = estimateNightlyFromPlace(base, index, name);

    return enrichForGroup({
      id: place.id || `places-lodging-${index + 1}`,
      name,
      nightlyRateUsd,
      totalEstimateUsd: totalEstimate(nightlyRateUsd, request.checkInDate, request.checkOutDate),
      bedrooms: inferred.bedrooms,
      walkMinutesToLift,
      hotTub: inferred.hotTub,
      laundry: inferred.laundry,
      kitchen: inferred.kitchen,
      bookingUrl: place.mapsUrl,
      sourceMeta: buildSourceMeta("live", 0.68)
    }, request, inferred.lodgingType);
  });
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

function defaultBedrooms(request: LodgingSearchRequest): number {
  const style = request.spec.groupComposition.roomingStyle ?? "hybrid";
  if (style === "couples") return 4;
  if (style === "singles") return 3;
  return 3;
}

function inferPropertyTraits(
  name: string,
  roomingStyle: "couples" | "singles" | "hybrid",
  minBedrooms: number
): {
  bedrooms: number;
  hotTub: boolean;
  laundry: boolean;
  kitchen: boolean;
  lodgingType: LodgingOption["lodgingType"];
} {
  const lower = name.toLowerCase();
  const condoLike = /(condo|residence|residences|suite|suites|villa|villas|apartment)/.test(lower);
  const resortLike = /(resort|lodge|spa|mountain|village|inn|hotel)/.test(lower);
  const largeProperty = /(grand|residences|villas)/.test(lower);
  const wholeHomeLike = /(condo|villa|villas|chalet|cabin|townhome|residence|residences|apartment)/.test(lower);

  const baseBedrooms =
    roomingStyle === "couples" ? 4 :
    roomingStyle === "singles" ? 3 :
    3;

  return {
    bedrooms: Math.max(minBedrooms, baseBedrooms + (largeProperty ? 1 : 0) + (condoLike ? 1 : 0)),
    hotTub: resortLike || /spa/.test(lower),
    laundry: condoLike || /residence/.test(lower),
    kitchen: condoLike,
    lodgingType: wholeHomeLike ? "whole_home" : /hotel|inn|lodge|resort/.test(lower) ? "hotel_property" : "unknown"
  };
}

function estimateNightlyFromPlace(base: number, index: number, name: string): number {
  const lower = name.toLowerCase();
  const premium =
    /ritz|four seasons|st\.?\s*regis|montage|luxury|grand|residences/.test(lower) ? 1.25 :
    /inn|lodge|hotel/.test(lower) ? 1.02 :
    0.95;
  const slot = [0.92, 1, 1.08, 1.16][index] ?? 1.05;
  return Math.max(90, Math.round(base * premium * slot));
}

function haversineMiles(originLat: number, originLng: number, targetLat: number, targetLng: number): number {
  const R = 3958.8;
  const dLat = toRadians(targetLat - originLat);
  const dLng = toRadians(targetLng - originLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(originLat)) * Math.cos(toRadians(targetLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function enrichForGroup(
  option: LodgingOption,
  request: LodgingSearchRequest,
  lodgingTypeHint?: LodgingOption["lodgingType"]
): LodgingOption {
  const groupSize = request.spec.group.size ?? 4;
  const lodgingType = lodgingTypeHint ?? inferLodgingType(option.name, option.bedrooms, option.kitchen);
  const estimatedSleeps = inferSleeps(option, lodgingType);
  const unitsNeededForGroup = Math.max(1, Math.ceil(groupSize / Math.max(1, estimatedSleeps)));
  const supportsWholeGroupSingleUnit = unitsNeededForGroup === 1 && estimatedSleeps >= groupSize;
  const groupNightlyTotalUsd = Math.max(1, Math.round(option.nightlyRateUsd * unitsNeededForGroup));
  const groupTotalEstimateUsd = Math.max(1, Math.round(option.totalEstimateUsd * unitsNeededForGroup));

  return {
    ...option,
    lodgingType,
    estimatedSleeps,
    unitsNeededForGroup,
    supportsWholeGroupSingleUnit,
    groupNightlyTotalUsd,
    groupTotalEstimateUsd
  };
}

function rankLodgingOptions(options: LodgingOption[], request: LodgingSearchRequest): LodgingOption[] {
  const groupSize = request.spec.group.size ?? 4;
  const targetGroupNightly =
    typeof request.nightlyBudgetCapUsd === "number" && request.nightlyBudgetCapUsd > 0
      ? request.nightlyBudgetCapUsd * groupSize
      : null;

  return options.slice().sort((a, b) => {
    const aSingle = Number(Boolean(a.supportsWholeGroupSingleUnit));
    const bSingle = Number(Boolean(b.supportsWholeGroupSingleUnit));
    if (aSingle !== bSingle) return bSingle - aSingle;

    const aUnits = a.unitsNeededForGroup ?? 99;
    const bUnits = b.unitsNeededForGroup ?? 99;
    if (aUnits !== bUnits) return aUnits - bUnits;

    if (targetGroupNightly) {
      const aDistance = Math.abs((a.groupNightlyTotalUsd ?? a.nightlyRateUsd) - targetGroupNightly);
      const bDistance = Math.abs((b.groupNightlyTotalUsd ?? b.nightlyRateUsd) - targetGroupNightly);
      if (aDistance !== bDistance) return aDistance - bDistance;
    }

    const aWalk = typeof a.walkMinutesToLift === "number" ? a.walkMinutesToLift : 999;
    const bWalk = typeof b.walkMinutesToLift === "number" ? b.walkMinutesToLift : 999;
    if (aWalk !== bWalk) return aWalk - bWalk;

    return (a.groupNightlyTotalUsd ?? a.nightlyRateUsd) - (b.groupNightlyTotalUsd ?? b.nightlyRateUsd);
  });
}

function inferLodgingType(name: string, bedrooms: number, kitchen: boolean): LodgingOption["lodgingType"] {
  const lower = name.toLowerCase();
  if (/(condo|villa|chalet|cabin|townhome|apartment|residence)/.test(lower)) return "whole_home";
  if (/(hotel|inn|lodge|resort)/.test(lower)) return bedrooms <= 1 && !kitchen ? "hotel_room" : "hotel_property";
  if (kitchen || bedrooms >= 2) return "whole_home";
  return "unknown";
}

function inferSleeps(option: LodgingOption, lodgingType: LodgingOption["lodgingType"]): number {
  const bedrooms = Math.max(1, option.bedrooms || 1);
  const baseByBedrooms =
    lodgingType === "whole_home"
      ? bedrooms * 2 + (option.kitchen ? 1 : 0)
      : bedrooms <= 1
        ? 2 + Number(option.kitchen)
        : bedrooms * 2;
  return Math.max(2, Math.min(16, baseByBedrooms));
}
