import { TripSpec } from "./tripSpec";
import { scoreResortForTrip } from "./snow";

export type Resort = {
  id: string;
  name: string;
  region: string;
  state: string;
  lat: number;
  lng: number;
  terrain: {
    beginner: number;
    intermediate: number;
    advanced: number;
    expert: number;
  };
  seasonMonths: number[];
  monthlySnowInches: Record<number, number>;
  monthlyAvgTempF: Record<number, number>;
};

export const RESORTS: Resort[] = [
  {
    id: "palisades",
    name: "Palisades Tahoe",
    region: "Tahoe",
    state: "California",
    lat: 39.1975,
    lng: -120.2358,
    terrain: { beginner: 0.25, intermediate: 0.45, advanced: 0.2, expert: 0.1 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 35, 12: 55, 1: 70, 2: 65, 3: 55, 4: 30 },
    monthlyAvgTempF: { 11: 36, 12: 30, 1: 28, 2: 30, 3: 34, 4: 40 }
  },
  {
    id: "heavenly",
    name: "Heavenly",
    region: "South Tahoe",
    state: "California",
    lat: 38.9351,
    lng: -119.9396,
    terrain: { beginner: 0.32, intermediate: 0.45, advanced: 0.18, expert: 0.05 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 25, 12: 45, 1: 60, 2: 55, 3: 40, 4: 22 },
    monthlyAvgTempF: { 11: 38, 12: 32, 1: 30, 2: 32, 3: 36, 4: 44 }
  },
  {
    id: "northstar",
    name: "Northstar",
    region: "North Tahoe",
    state: "California",
    lat: 39.2749,
    lng: -120.1212,
    terrain: { beginner: 0.4, intermediate: 0.4, advanced: 0.15, expert: 0.05 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 28, 12: 50, 1: 65, 2: 60, 3: 45, 4: 25 },
    monthlyAvgTempF: { 11: 37, 12: 31, 1: 29, 2: 31, 3: 35, 4: 42 }
  },
  {
    id: "breckenridge",
    name: "Breckenridge",
    region: "Summit County",
    state: "Colorado",
    lat: 39.4817,
    lng: -106.0384,
    terrain: { beginner: 0.11, intermediate: 0.31, advanced: 0.26, expert: 0.32 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 30, 12: 36, 1: 38, 2: 35, 3: 32, 4: 22 },
    monthlyAvgTempF: { 11: 27, 12: 19, 1: 18, 2: 19, 3: 23, 4: 30 }
  },
  {
    id: "keystone",
    name: "Keystone",
    region: "Summit County",
    state: "Colorado",
    lat: 39.5792,
    lng: -105.9347,
    terrain: { beginner: 0.12, intermediate: 0.39, advanced: 0.36, expert: 0.13 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 28, 12: 33, 1: 36, 2: 34, 3: 30, 4: 20 },
    monthlyAvgTempF: { 11: 28, 12: 20, 1: 19, 2: 20, 3: 24, 4: 32 }
  },
  {
    id: "vail",
    name: "Vail",
    region: "Vail Valley",
    state: "Colorado",
    lat: 39.6403,
    lng: -106.3742,
    terrain: { beginner: 0.18, intermediate: 0.29, advanced: 0.39, expert: 0.14 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 26, 12: 32, 1: 35, 2: 32, 3: 30, 4: 19 },
    monthlyAvgTempF: { 11: 29, 12: 21, 1: 20, 2: 21, 3: 25, 4: 33 }
  }
];

export function findResortByName(name: string): Resort | null {
  const lower = name.toLowerCase();
  return RESORTS.find((resort) => resort.name.toLowerCase().includes(lower)) ?? null;
}

export function shortlistResorts(spec: TripSpec, limit = 3): Resort[] {
  if (spec.location.resort) {
    const match = findResortByName(spec.location.resort);
    return match ? [match] : [];
  }

  let candidates = RESORTS;

  if (spec.location.region) {
    const regionLower = spec.location.region.toLowerCase();
    candidates = candidates.filter((resort) => resort.region.toLowerCase().includes(regionLower));
  }

  if (spec.location.state) {
    const stateLower = spec.location.state.toLowerCase();
    candidates = candidates.filter((resort) => resort.state.toLowerCase().includes(stateLower));
  }

  if (spec.location.openToSuggestions || candidates.length === 0) {
    candidates = RESORTS;
  }

  const scored = candidates.map((resort) => ({
    resort,
    score: scoreResortForTrip(spec, resort)
  }));

  return scored
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, limit)
    .map((entry) => entry.resort);
}
