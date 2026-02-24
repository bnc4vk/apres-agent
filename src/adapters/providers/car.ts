import { searchBookingCars } from "../integrations/bookingDemand";
import { CarOption, buildSourceMeta } from "../../core/supply";
import { CarProvider, CarSearchRequest } from "./types";
import { CachedProviderBase } from "./cachedProviderBase";

export class BookingDemandCarProvider
  extends CachedProviderBase<CarSearchRequest, CarOption[], CarOption[]>
  implements CarProvider
{
  protected readonly cacheTtlMs = 30 * 60 * 1000;

  protected cacheKey(request: CarSearchRequest): string {
    return `${request.airportCode}|${request.pickupDate}|${request.dropoffDate}`;
  }

  protected async loadFresh(request: CarSearchRequest): Promise<CarOption[]> {
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
