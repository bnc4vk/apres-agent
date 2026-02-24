import { getPoiProvider } from "../adapters/providers";
import { PoiBundle, PoiOption } from "./supply";
import { TripSpec } from "./tripSpec";

export type POI = PoiOption;
export type POIResults = PoiBundle;

export async function fetchNearbyPOIs(spec: TripSpec, locationHint: string): Promise<POIResults> {
  const provider = getPoiProvider();
  return provider.search({ spec, resortName: locationHint });
}
