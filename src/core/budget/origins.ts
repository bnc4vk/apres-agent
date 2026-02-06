import { OriginRegion } from "./types";

const ORIGIN_AIRPORTS: Array<{ match: RegExp; airport: string; region: OriginRegion }> = [
  { match: /\b(nyc|new york|brooklyn|queens|manhattan)\b/i, airport: "JFK", region: "east" },
  { match: /\b(boston)\b/i, airport: "BOS", region: "east" },
  { match: /\b(philly|philadelphia)\b/i, airport: "PHL", region: "east" },
  { match: /\b(dc|washington)\b/i, airport: "DCA", region: "east" },
  { match: /\b(atlanta)\b/i, airport: "ATL", region: "east" },
  { match: /\b(chicago)\b/i, airport: "ORD", region: "central" },
  { match: /\b(dallas)\b/i, airport: "DFW", region: "central" },
  { match: /\b(denver)\b/i, airport: "DEN", region: "west" },
  { match: /\b(sf|san francisco|bay area)\b/i, airport: "SFO", region: "west" },
  { match: /\b(oakland)\b/i, airport: "OAK", region: "west" },
  { match: /\b(san jose)\b/i, airport: "SJC", region: "west" },
  { match: /\b(sacramento)\b/i, airport: "SMF", region: "west" },
  { match: /\b(seattle)\b/i, airport: "SEA", region: "west" },
  { match: /\b(los angeles|la)\b/i, airport: "LAX", region: "west" }
];

export function resolveOriginAirport(origin: string): { airport: string | null; region: OriginRegion } {
  for (const candidate of ORIGIN_AIRPORTS) {
    if (candidate.match.test(origin)) {
      return { airport: candidate.airport, region: candidate.region };
    }
  }
  return { airport: null, region: "east" };
}

export function fallbackFlightPrice(region: OriginRegion, destinationState: string): number {
  const toColorado = destinationState === "Colorado";
  if (region === "west") return toColorado ? 280 : 180;
  if (region === "central") return toColorado ? 230 : 300;
  return toColorado ? 420 : 490;
}
