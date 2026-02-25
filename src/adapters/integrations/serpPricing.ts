import { appConfig } from "../../config/appConfig";

export type PriceSource = "live" | "estimated";

export type FlightPriceInput = {
  originAirport: string;
  destinationAirport: string;
  departDate: string;
  returnDate: string;
};

export type HotelPriceInput = {
  locationQuery: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
};

function hasApiKey(): boolean {
  return Boolean(appConfig.serpApiKey);
}

const SERPAPI_TIMEOUT_MS = 7000;

export async function fetchLiveFlightPrice(input: FlightPriceInput): Promise<number | null> {
  if (!hasApiKey()) return null;

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_flights");
  url.searchParams.set("api_key", appConfig.serpApiKey);
  url.searchParams.set("departure_id", input.originAirport);
  url.searchParams.set("arrival_id", input.destinationAirport);
  url.searchParams.set("outbound_date", input.departDate);
  url.searchParams.set("return_date", input.returnDate);
  url.searchParams.set("currency", "USD");
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");

  try {
    const response = await fetch(url.toString(), { signal: timeoutSignal(SERPAPI_TIMEOUT_MS) });
    if (!response.ok) return null;
    const payload: any = await response.json();

    const candidatePrices: Array<number | null> = [
      parsePrice(payload?.best_flights?.[0]?.price),
      parsePrice(payload?.other_flights?.[0]?.price),
      parsePrice(payload?.price_insights?.lowest_price)
    ];
    return firstValid(candidatePrices);
  } catch {
    return null;
  }
}

export async function fetchLiveHotelNightlyPrice(input: HotelPriceInput): Promise<number | null> {
  if (!hasApiKey()) return null;

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_hotels");
  url.searchParams.set("api_key", appConfig.serpApiKey);
  url.searchParams.set("q", input.locationQuery);
  url.searchParams.set("check_in_date", input.checkInDate);
  url.searchParams.set("check_out_date", input.checkOutDate);
  url.searchParams.set("adults", String(Math.max(1, input.adults)));
  url.searchParams.set("currency", "USD");
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");

  try {
    const response = await fetch(url.toString(), { signal: timeoutSignal(SERPAPI_TIMEOUT_MS) });
    if (!response.ok) return null;
    const payload: any = await response.json();

    const properties = Array.isArray(payload?.properties) ? payload.properties : [];
    const nightlyCandidates = properties
      .slice(0, 8)
      .map((property: any) =>
        parsePrice(
          property?.rate_per_night?.lowest ??
            property?.rate_per_night?.extracted_lowest ??
            property?.total_rate?.lowest ??
            property?.price
        )
      )
      .filter((value: number | null): value is number => typeof value === "number" && Number.isFinite(value));

    if (nightlyCandidates.length === 0) {
      return parsePrice(payload?.search_information?.hotel_price);
    }

    const sorted = nightlyCandidates.sort((a: number, b: number) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return median;
  } catch {
    return null;
  }
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function parsePrice(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") return null;
  const digits = input.replace(/[^\d.]/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstValid(values: Array<number | null>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}
