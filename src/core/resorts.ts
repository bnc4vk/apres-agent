export type Resort = {
  id: string;
  name: string;
  region: string;
  state: string;
  passPrograms: Array<"ikon" | "epic" | "indy" | "mountain_collective">;
  nearestAirport: string;
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
    passPrograms: ["ikon", "mountain_collective"],
    nearestAirport: "RNO",
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
    passPrograms: ["epic"],
    nearestAirport: "RNO",
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
    passPrograms: ["epic"],
    nearestAirport: "RNO",
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
    passPrograms: ["epic"],
    nearestAirport: "DEN",
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
    passPrograms: ["epic"],
    nearestAirport: "DEN",
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
    passPrograms: ["epic"],
    nearestAirport: "EGE",
    lat: 39.6403,
    lng: -106.3742,
    terrain: { beginner: 0.18, intermediate: 0.29, advanced: 0.39, expert: 0.14 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 26, 12: 32, 1: 35, 2: 32, 3: 30, 4: 19 },
    monthlyAvgTempF: { 11: 29, 12: 21, 1: 20, 2: 21, 3: 25, 4: 33 }
  },
  {
    id: "copper-mountain",
    name: "Copper Mountain",
    region: "Summit County",
    state: "Colorado",
    passPrograms: ["ikon"],
    nearestAirport: "DEN",
    lat: 39.5022,
    lng: -106.1511,
    terrain: { beginner: 0.21, intermediate: 0.25, advanced: 0.36, expert: 0.18 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 28, 12: 35, 1: 37, 2: 35, 3: 31, 4: 22 },
    monthlyAvgTempF: { 11: 27, 12: 19, 1: 18, 2: 19, 3: 23, 4: 31 }
  },
  {
    id: "winter-park",
    name: "Winter Park",
    region: "Front Range",
    state: "Colorado",
    passPrograms: ["ikon"],
    nearestAirport: "DEN",
    lat: 39.886,
    lng: -105.7625,
    terrain: { beginner: 0.08, intermediate: 0.18, advanced: 0.34, expert: 0.4 },
    seasonMonths: [11, 12, 1, 2, 3, 4, 5],
    monthlySnowInches: { 11: 27, 12: 35, 1: 38, 2: 36, 3: 34, 4: 26, 5: 12 },
    monthlyAvgTempF: { 11: 24, 12: 17, 1: 15, 2: 17, 3: 21, 4: 28, 5: 37 }
  },
  {
    id: "steamboat",
    name: "Steamboat",
    region: "Northwest Colorado",
    state: "Colorado",
    passPrograms: ["ikon"],
    nearestAirport: "HDN",
    lat: 40.4588,
    lng: -106.8047,
    terrain: { beginner: 0.14, intermediate: 0.42, advanced: 0.44, expert: 0 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 35, 12: 44, 1: 47, 2: 43, 3: 39, 4: 24 },
    monthlyAvgTempF: { 11: 28, 12: 20, 1: 18, 2: 20, 3: 25, 4: 33 }
  },
  {
    id: "park-city",
    name: "Park City",
    region: "Wasatch",
    state: "Utah",
    passPrograms: ["epic"],
    nearestAirport: "SLC",
    lat: 40.6514,
    lng: -111.5072,
    terrain: { beginner: 0.18, intermediate: 0.42, advanced: 0.28, expert: 0.12 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 28, 12: 46, 1: 52, 2: 50, 3: 44, 4: 28 },
    monthlyAvgTempF: { 11: 36, 12: 30, 1: 27, 2: 30, 3: 36, 4: 44 }
  },
  {
    id: "deer-valley",
    name: "Deer Valley",
    region: "Wasatch",
    state: "Utah",
    passPrograms: ["ikon"],
    nearestAirport: "SLC",
    lat: 40.6196,
    lng: -111.4783,
    terrain: { beginner: 0.27, intermediate: 0.41, advanced: 0.24, expert: 0.08 },
    seasonMonths: [11, 12, 1, 2, 3, 4],
    monthlySnowInches: { 11: 30, 12: 49, 1: 56, 2: 53, 3: 47, 4: 31 },
    monthlyAvgTempF: { 11: 35, 12: 29, 1: 26, 2: 29, 3: 35, 4: 43 }
  },
  {
    id: "snowbird",
    name: "Snowbird",
    region: "Wasatch",
    state: "Utah",
    passPrograms: ["ikon"],
    nearestAirport: "SLC",
    lat: 40.5808,
    lng: -111.6572,
    terrain: { beginner: 0.14, intermediate: 0.35, advanced: 0.32, expert: 0.19 },
    seasonMonths: [11, 12, 1, 2, 3, 4, 5],
    monthlySnowInches: { 11: 42, 12: 74, 1: 82, 2: 80, 3: 76, 4: 58, 5: 28 },
    monthlyAvgTempF: { 11: 30, 12: 24, 1: 22, 2: 24, 3: 30, 4: 38, 5: 47 }
  }
];

export function findResortByName(name: string): Resort | null {
  const lower = name.toLowerCase();
  return RESORTS.find((resort) => resort.name.toLowerCase().includes(lower)) ?? null;
}
