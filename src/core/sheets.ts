import { ItineraryPlan } from "./itinerary";
import { TripSpec } from "./tripSpec";

export type SheetResult = {
  sheetId: string;
  sheetUrl: string;
};

export async function createSheetForTrip(
  _spec: TripSpec,
  _decision: ItineraryPlan
): Promise<SheetResult> {
  const sheetId = "demo-sheet-id";
  return {
    sheetId,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`
  };
}
