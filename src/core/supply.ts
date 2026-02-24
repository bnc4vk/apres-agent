export type DataSource = "live" | "estimated";

export type SourceMeta = {
  source: DataSource;
  fetchedAt: string;
  confidence: number;
};

export type LodgingOption = {
  id: string;
  name: string;
  nightlyRateUsd: number;
  totalEstimateUsd: number;
  bedrooms: number;
  walkMinutesToLift: number | null;
  hotTub: boolean;
  laundry: boolean;
  kitchen: boolean;
  bookingUrl: string | null;
  sourceMeta: SourceMeta;
};

export type CarOption = {
  id: string;
  provider: string;
  vehicleClass: string;
  totalPriceUsd: number;
  seats: number;
  pickupLocation: string;
  dropoffLocation: string;
  pickupTime: string | null;
  dropoffTime: string | null;
  bookingUrl: string | null;
  sourceMeta: SourceMeta;
};

export type PoiOption = {
  id: string;
  name: string;
  type: "gear" | "grocery" | "restaurant";
  rating: number | null;
  distanceMiles: number | null;
  hours: string;
  mapsUrl: string | null;
  supportsTakeout: boolean | null;
  reservable: boolean | null;
  dineIn: boolean | null;
  groupCapacityEstimate: number | null;
  sourceMeta: SourceMeta;
};

export type PoiBundle = {
  gearShops: PoiOption[];
  groceries: PoiOption[];
  restaurants: PoiOption[];
};

export function buildSourceMeta(source: DataSource, confidence: number): SourceMeta {
  return {
    source,
    fetchedAt: new Date().toISOString(),
    confidence
  };
}
