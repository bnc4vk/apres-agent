import { appConfig } from "../../config/appConfig";

export type PlacesResult = {
  id: string;
  name: string;
  rating: number | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  takeout: boolean | null;
  reservable: boolean | null;
  dineIn: boolean | null;
  regularOpeningHours: string | null;
};

type SearchInput = {
  query: string;
  latitude: number;
  longitude: number;
};

const GOOGLE_PLACES_TIMEOUT_MS = 7000;

export async function searchPlacesText(input: SearchInput): Promise<PlacesResult[] | null> {
  if (!appConfig.googlePlacesApiKey) return null;

  const url = "https://places.googleapis.com/v1/places:searchText";
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.rating",
    "places.googleMapsUri",
    "places.location",
    "places.formattedAddress",
    "places.takeout",
    "places.reservable",
    "places.dineIn",
    "places.regularOpeningHours"
  ].join(",");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": appConfig.googlePlacesApiKey,
        "X-Goog-FieldMask": fieldMask
      },
      signal: timeoutSignal(GOOGLE_PLACES_TIMEOUT_MS),
      body: JSON.stringify({
        textQuery: input.query,
        locationBias: {
          circle: {
            center: {
              latitude: input.latitude,
              longitude: input.longitude
            },
            radius: 12000
          }
        }
      })
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as any;
    const places = Array.isArray(payload?.places) ? payload.places : [];
    return places.slice(0, 8).map((place: any) => ({
      id: String(place.id ?? ""),
      name: String(place.displayName?.text ?? "Place"),
      rating: typeof place.rating === "number" ? place.rating : null,
      mapsUrl: typeof place.googleMapsUri === "string" ? place.googleMapsUri : null,
      latitude: typeof place.location?.latitude === "number" ? place.location.latitude : null,
      longitude: typeof place.location?.longitude === "number" ? place.location.longitude : null,
      formattedAddress: typeof place.formattedAddress === "string" ? place.formattedAddress : null,
      takeout: typeof place.takeout === "boolean" ? place.takeout : null,
      reservable: typeof place.reservable === "boolean" ? place.reservable : null,
      dineIn: typeof place.dineIn === "boolean" ? place.dineIn : null,
      regularOpeningHours: toOpeningHours(place.regularOpeningHours?.weekdayDescriptions)
    }));
  } catch {
    return null;
  }
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function toOpeningHours(input: unknown): string | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const first = input.find((line) => typeof line === "string");
  return typeof first === "string" ? first : null;
}
