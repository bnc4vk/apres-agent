import { appConfig } from "../config/appConfig";

export type BookingLodgingResult = {
  id: string;
  name: string;
  nightlyRateUsd: number;
  bookingUrl: string | null;
  bedrooms: number;
  walkMinutesToLift: number | null;
  hotTub: boolean;
  laundry: boolean;
  kitchen: boolean;
};

export type BookingCarResult = {
  id: string;
  provider: string;
  vehicleClass: string;
  totalPriceUsd: number;
  seats: number;
  bookingUrl: string | null;
};

export type BookingLodgingSearchInput = {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  rooms: number;
  maxNightlyUsd?: number | null;
};

export type BookingCarSearchInput = {
  airportCode: string;
  pickupDate: string;
  dropoffDate: string;
};

function hasConfig(): boolean {
  return Boolean(appConfig.bookingApiKey && appConfig.bookingApiBaseUrl);
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${appConfig.bookingApiKey}`,
    "Content-Type": "application/json"
  };
}

export async function searchBookingLodging(input: BookingLodgingSearchInput): Promise<BookingLodgingResult[] | null> {
  if (!hasConfig()) return null;

  try {
    const url = new URL(`${appConfig.bookingApiBaseUrl}/accommodations/search`);
    const body = {
      destination: { query: input.destination },
      checkin: input.checkInDate,
      checkout: input.checkOutDate,
      guests: { number_of_adults: input.adults },
      rooms: input.rooms
    } as Record<string, unknown>;
    if (typeof input.maxNightlyUsd === "number" && input.maxNightlyUsd > 0) {
      body.price = { max: input.maxNightlyUsd, currency: "USD" };
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as any;
    const accommodations = Array.isArray(payload?.accommodations) ? payload.accommodations : [];
    return accommodations.slice(0, 6).map((item: any, index: number) => ({
      id: String(item.id ?? `booking-${index + 1}`),
      name: String(item.name ?? "Booking.com property"),
      nightlyRateUsd: Number(item?.price?.nightly ?? item?.price?.value ?? 0) || 0,
      bookingUrl: typeof item?.url === "string" ? item.url : null,
      bedrooms: Number(item?.bedrooms ?? item?.room_count ?? 1) || 1,
      walkMinutesToLift: parseWalkMinutes(item?.distance_to_lift_meters),
      hotTub: Boolean(item?.amenities?.includes?.("hot_tub")),
      laundry: Boolean(item?.amenities?.includes?.("laundry")),
      kitchen: Boolean(item?.amenities?.includes?.("kitchen"))
    }));
  } catch {
    return null;
  }
}

export async function searchBookingCars(input: BookingCarSearchInput): Promise<BookingCarResult[] | null> {
  if (!hasConfig()) return null;
  try {
    const url = new URL(`${appConfig.bookingApiBaseUrl}/cars/search`);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        pick_up: { location: input.airportCode, date: input.pickupDate },
        drop_off: { location: input.airportCode, date: input.dropoffDate },
        currency: "USD"
      })
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as any;
    const cars = Array.isArray(payload?.results) ? payload.results : [];
    return cars.slice(0, 5).map((item: any, index: number) => ({
      id: String(item.id ?? `car-${index + 1}`),
      provider: String(item.supplier ?? item.provider ?? "Car partner"),
      vehicleClass: String(item.vehicle_class ?? item.car_class ?? "SUV"),
      totalPriceUsd: Number(item.total_price ?? item.price ?? 0) || 0,
      seats: Number(item.seats ?? 5) || 5,
      bookingUrl: typeof item.deep_link === "string" ? item.deep_link : null
    }));
  } catch {
    return null;
  }
}

function parseWalkMinutes(distanceMeters: unknown): number | null {
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return null;
  }
  const walkMinutes = Math.round(distanceMeters / 80);
  return Math.max(1, walkMinutes);
}
