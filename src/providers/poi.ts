import { searchPlacesText } from "../integrations/googlePlacesV1";
import { PoiBundle, PoiOption, buildSourceMeta } from "../core/supply";
import { findResortByName, RESORTS } from "../core/resorts";
import { PoiProvider, PoiSearchRequest } from "./types";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE = new Map<string, { expiresAt: number; value: PoiBundle }>();

export class GooglePlacesPoiProvider implements PoiProvider {
  async search(request: PoiSearchRequest): Promise<PoiBundle> {
    const resort = findResortByName(request.resortName) ?? RESORTS[0];
    if (!resort) return buildFallbackPois();

    const cacheKey = `${resort.id}|${request.spec.diningConstraints.mustSupportTakeout ?? "any"}|${request.spec.diningConstraints.mustBeReservable ?? "any"}`;
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const [gear, grocery, restaurants] = await Promise.all([
      searchPlacesText({ query: `ski rental near ${resort.name}`, latitude: resort.lat, longitude: resort.lng }),
      searchPlacesText({ query: `grocery near ${resort.name}`, latitude: resort.lat, longitude: resort.lng }),
      searchPlacesText({ query: `restaurant near ${resort.name}`, latitude: resort.lat, longitude: resort.lng })
    ]);

    const bundle = {
      gearShops: toOptions(gear, "gear", resort.lat, resort.lng),
      groceries: toOptions(grocery, "grocery", resort.lat, resort.lng),
      restaurants: applyDiningFilters(
        toOptions(restaurants, "restaurant", resort.lat, resort.lng),
        request
      )
    };

    const value = hasLive(bundle) ? bundle : buildFallbackPois();
    CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }
}

function toOptions(
  places: Awaited<ReturnType<typeof searchPlacesText>>,
  type: PoiOption["type"],
  lat: number,
  lng: number
): PoiOption[] {
  if (!places || places.length === 0) return [];

  return places.slice(0, 6).map((item, index) => ({
    id: item.id || `${type}-${index + 1}`,
    name: item.name,
    type,
    rating: item.rating,
    distanceMiles:
      typeof item.latitude === "number" && typeof item.longitude === "number"
        ? distanceMiles(lat, lng, item.latitude, item.longitude)
        : null,
    hours: item.regularOpeningHours ?? "Hours unavailable",
    mapsUrl: item.mapsUrl,
    supportsTakeout: item.takeout,
    reservable: item.reservable,
    dineIn: item.dineIn,
    groupCapacityEstimate: estimateCapacity(item.rating),
    sourceMeta: buildSourceMeta("live", 0.83)
  }));
}

function applyDiningFilters(items: PoiOption[], request: PoiSearchRequest): PoiOption[] {
  const constraints = request.spec.diningConstraints;
  const hard = constraints.constraintMode === "hard";
  if (!hard) return items.slice(0, 5);

  const filtered = items.filter((item) => {
    if (constraints.mustSupportTakeout && item.supportsTakeout === false) return false;
    if (constraints.mustBeReservable && item.reservable === false) return false;
    if (
      typeof constraints.minGroupCapacity === "number" &&
      typeof item.groupCapacityEstimate === "number" &&
      item.groupCapacityEstimate < constraints.minGroupCapacity
    ) {
      return false;
    }
    return true;
  });

  return (filtered.length > 0 ? filtered : items).slice(0, 5);
}

function buildFallbackPois(): PoiBundle {
  const meta = buildSourceMeta("estimated", 0.52);
  return {
    gearShops: [
      {
        id: "gear-est-1",
        name: "Summit Ski Rentals",
        type: "gear",
        rating: 4.7,
        distanceMiles: 0.8,
        hours: "8:00 AM - 7:00 PM",
        mapsUrl: null,
        supportsTakeout: null,
        reservable: null,
        dineIn: null,
        groupCapacityEstimate: null,
        sourceMeta: meta
      }
    ],
    groceries: [
      {
        id: "grocery-est-1",
        name: "Mountain Market",
        type: "grocery",
        rating: 4.5,
        distanceMiles: 1.2,
        hours: "7:00 AM - 9:00 PM",
        mapsUrl: null,
        supportsTakeout: null,
        reservable: null,
        dineIn: null,
        groupCapacityEstimate: null,
        sourceMeta: meta
      }
    ],
    restaurants: [
      {
        id: "rest-est-1",
        name: "Alpine Hearth",
        type: "restaurant",
        rating: 4.6,
        distanceMiles: 0.6,
        hours: "4:00 PM - 10:00 PM",
        mapsUrl: null,
        supportsTakeout: true,
        reservable: true,
        dineIn: true,
        groupCapacityEstimate: 12,
        sourceMeta: meta
      }
    ]
  };
}

function hasLive(bundle: PoiBundle): boolean {
  const all = [...bundle.gearShops, ...bundle.groceries, ...bundle.restaurants];
  return all.some((item) => item.sourceMeta.source === "live");
}

function distanceMiles(originLat: number, originLng: number, targetLat: number, targetLng: number): number {
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

function estimateCapacity(rating: number | null): number | null {
  if (rating === null) return null;
  if (rating >= 4.6) return 18;
  if (rating >= 4.2) return 12;
  return 8;
}
