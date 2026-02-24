import { searchBookingCars } from "../integrations/bookingDemand";
import { CarOption, buildSourceMeta } from "../core/supply";
import { CarProvider, CarSearchRequest } from "./types";

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE = new Map<string, { expiresAt: number; value: CarOption[] }>();

export class BookingDemandCarProvider implements CarProvider {
  async search(request: CarSearchRequest): Promise<CarOption[]> {
    const cacheKey = `${request.airportCode}|${request.pickupDate}|${request.dropoffDate}`;
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const live = await searchBookingCars({
      airportCode: request.airportCode,
      pickupDate: request.pickupDate,
      dropoffDate: request.dropoffDate
    });

    const options =
      live && live.length > 0
        ? live.map((item) => ({
            id: item.id,
            provider: item.provider,
            vehicleClass: item.vehicleClass,
            totalPriceUsd: item.totalPriceUsd,
            seats: item.seats,
            pickupLocation: request.airportCode,
            dropoffLocation: request.airportCode,
            pickupTime: `${request.pickupDate}T10:00:00`,
            dropoffTime: `${request.dropoffDate}T10:00:00`,
            bookingUrl: item.bookingUrl,
            sourceMeta: buildSourceMeta("live", 0.8)
          }))
        : buildEstimatedCars(request);

    CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: options });
    return options;
  }
}

function buildEstimatedCars(request: CarSearchRequest): CarOption[] {
  return [
    {
      id: "car-est-1",
      provider: "Hertz",
      vehicleClass: "SUV AWD",
      totalPriceUsd: 520,
      seats: 5,
      pickupLocation: request.airportCode,
      dropoffLocation: request.airportCode,
      pickupTime: `${request.pickupDate}T10:00:00`,
      dropoffTime: `${request.dropoffDate}T10:00:00`,
      bookingUrl: null,
      sourceMeta: buildSourceMeta("estimated", 0.57)
    },
    {
      id: "car-est-2",
      provider: "Enterprise",
      vehicleClass: "Standard SUV",
      totalPriceUsd: 610,
      seats: 7,
      pickupLocation: request.airportCode,
      dropoffLocation: request.airportCode,
      pickupTime: `${request.pickupDate}T11:00:00`,
      dropoffTime: `${request.dropoffDate}T11:00:00`,
      bookingUrl: null,
      sourceMeta: buildSourceMeta("estimated", 0.55)
    }
  ];
}
