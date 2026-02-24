import { BookingDemandCarProvider } from "./car";
import { BookingDemandLodgingProvider } from "./lodging";
import { GooglePlacesPoiProvider } from "./poi";
import { CarProvider, LodgingProvider, PoiProvider } from "./types";

let lodgingProvider: LodgingProvider | null = null;
let carProvider: CarProvider | null = null;
let poiProvider: PoiProvider | null = null;

export function getLodgingProvider(): LodgingProvider {
  if (!lodgingProvider) {
    lodgingProvider = new BookingDemandLodgingProvider();
  }
  return lodgingProvider;
}

export function getCarProvider(): CarProvider {
  if (!carProvider) {
    carProvider = new BookingDemandCarProvider();
  }
  return carProvider;
}

export function getPoiProvider(): PoiProvider {
  if (!poiProvider) {
    poiProvider = new GooglePlacesPoiProvider();
  }
  return poiProvider;
}
