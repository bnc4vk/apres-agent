import { CarOption, LodgingOption, PoiBundle } from "../../core/supply";
import { TripSpec } from "../../core/tripSpec";

export type LodgingSearchRequest = {
  spec: TripSpec;
  resortName: string;
  checkInDate: string;
  checkOutDate: string;
  nightlyBudgetCapUsd: number | null;
};

export type CarSearchRequest = {
  spec: TripSpec;
  airportCode: string;
  pickupDate: string;
  dropoffDate: string;
};

export type PoiSearchRequest = {
  spec: TripSpec;
  resortName: string;
};

export type LodgingProvider = {
  search(request: LodgingSearchRequest): Promise<LodgingOption[]>;
};

export type CarProvider = {
  search(request: CarSearchRequest): Promise<CarOption[]>;
};

export type PoiProvider = {
  search(request: PoiSearchRequest): Promise<PoiBundle>;
};
