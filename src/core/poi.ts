export type POI = {
  name: string;
  type: "gear" | "grocery" | "restaurant";
  rating: number;
  distanceMiles: number;
  hours: string;
};

export type POIResults = {
  gearShops: POI[];
  groceries: POI[];
  restaurants: POI[];
};

export async function fetchNearbyPOIs(_locationHint: string): Promise<POIResults> {
  return {
    gearShops: [
      {
        name: "Summit Ski Rentals",
        type: "gear",
        rating: 4.7,
        distanceMiles: 0.8,
        hours: "8:00 AM – 7:00 PM"
      }
    ],
    groceries: [
      {
        name: "Mountain Market",
        type: "grocery",
        rating: 4.5,
        distanceMiles: 1.2,
        hours: "7:00 AM – 9:00 PM"
      }
    ],
    restaurants: [
      {
        name: "Alpine Hearth",
        type: "restaurant",
        rating: 4.6,
        distanceMiles: 0.6,
        hours: "4:00 PM – 10:00 PM"
      }
    ]
  };
}
