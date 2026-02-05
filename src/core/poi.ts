import { appConfig } from "../config/appConfig";
import { findResortByName, RESORTS } from "./resorts";

export type POI = {
  name: string;
  type: "gear" | "grocery" | "restaurant";
  rating: number | null;
  distanceMiles: number | null;
  hours: string;
  mapsUrl?: string;
};

export type POIResults = {
  gearShops: POI[];
  groceries: POI[];
  restaurants: POI[];
};

type CacheEntry = {
  expiresAt: number;
  data: POIResults;
};

const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function fetchNearbyPOIs(locationHint: string): Promise<POIResults> {
  if (!appConfig.googlePlacesApiKey) {
    return buildStubPois();
  }

  const resort = findResortByName(locationHint) ?? RESORTS[0];
  if (!resort) {
    return buildStubPois();
  }

  const cacheKey = `${resort.id}`;
  const cached = CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [gearShops, groceries, restaurants] = await Promise.all([
    fetchPlaces(resort, "gear", "ski rental"),
    fetchPlaces(resort, "grocery", "grocery store"),
    fetchDiverseTakeoutRestaurants(resort)
  ]);

  const result = { gearShops, groceries, restaurants };
  CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: result });
  return result;
}

async function fetchDiverseTakeoutRestaurants(
  resort: { lat: number; lng: number }
): Promise<POI[]> {
  const categories = ["takeout pizza", "takeout asian food", "takeout mexican food"];
  const lists = await Promise.all(categories.map((category) => fetchPlaces(resort, "restaurant", category)));
  const deduped = new Map<string, POI>();
  for (const list of lists) {
    for (const item of list) {
      if (!deduped.has(item.name)) {
        deduped.set(item.name, item);
      }
    }
  }
  return [...deduped.values()].slice(0, 5);
}

async function fetchPlaces(
  resort: { lat: number; lng: number },
  type: POI["type"],
  keyword: string
): Promise<POI[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${resort.lat},${resort.lng}`);
  url.searchParams.set("radius", "8000");
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("key", appConfig.googlePlacesApiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return buildStubPois()[type === "gear" ? "gearShops" : type === "grocery" ? "groceries" : "restaurants"];
  }
  const data = await response.json();
  const results = (data.results ?? []).slice(0, 3);
  return results.map((place: any) => ({
    name: place.name,
    type,
    rating: place.rating ?? null,
    distanceMiles: place.geometry?.location ? distanceMiles(resort, place.geometry.location) : null,
    hours: place.opening_hours?.open_now === true ? "Open now" : "Hours unavailable",
    mapsUrl: place.place_id ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}` : undefined
  }));
}

function distanceMiles(
  resort: { lat: number; lng: number },
  location: { lat: number; lng: number }
): number {
  const R = 3958.8;
  const dLat = toRadians(location.lat - resort.lat);
  const dLng = toRadians(location.lng - resort.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(resort.lat)) *
      Math.cos(toRadians(location.lat)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function buildStubPois(): POIResults {
  return {
    gearShops: [
      {
        name: "Summit Ski Rentals",
        type: "gear",
        rating: 4.7,
        distanceMiles: 0.8,
        hours: "8:00 AM – 7:00 PM"
      }
    ],
    groceries: [
      {
        name: "Mountain Market",
        type: "grocery",
        rating: 4.5,
        distanceMiles: 1.2,
        hours: "7:00 AM – 9:00 PM"
      }
    ],
    restaurants: [
      {
        name: "Alpine Hearth",
        type: "restaurant",
        rating: 4.6,
        distanceMiles: 0.6,
        hours: "4:00 PM – 10:00 PM"
      }
    ]
  };
}
