import { CarProvider, LodgingProvider, PoiProvider } from "./types";
import { getAppContainer } from "../../runtime/appContainer";

export function getLodgingProvider(): LodgingProvider {
  return getAppContainer().getLodgingProvider();
}

export function getCarProvider(): CarProvider {
  return getAppContainer().getCarProvider();
}

export function getPoiProvider(): PoiProvider {
  return getAppContainer().getPoiProvider();
}
