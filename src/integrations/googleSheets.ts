import { google } from "googleapis";
import { TripSpec } from "../core/tripSpec";
import { DecisionPackage } from "../core/decision";

export type SheetResult = {
  sheetId: string;
  sheetUrl: string;
};

export async function createSheetForTrip(
  auth: any,
  spec: TripSpec,
  decision: DecisionPackage
): Promise<SheetResult> {
  const sheets = google.sheets({ version: "v4", auth });
  const title = buildSheetTitle(spec, decision);

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: "Summary" } },
        { properties: { title: "Itineraries" } },
        { properties: { title: "POIs" } },
        { properties: { title: "Logistics" } }
      ]
    }
  });

  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) {
    throw new Error("Failed to create spreadsheet.");
  }

  await Promise.all([
    writeSummary(sheets, spreadsheetId, spec, decision),
    writeItineraries(sheets, spreadsheetId, decision),
    writePois(sheets, spreadsheetId, decision),
    writeLogistics(sheets, spreadsheetId, spec, decision)
  ]);

  return {
    sheetId: spreadsheetId,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
  };
}

function buildSheetTitle(spec: TripSpec, decision: DecisionPackage): string {
  const start = spec.dates.start ?? "TBD";
  const end = spec.dates.end ?? "TBD";
  const topResort = decision.resortShortlist[0] ?? "Trip";
  return `Apres AI — ${topResort} (${start} to ${end})`;
}

async function writeSummary(sheets: any, spreadsheetId: string, spec: TripSpec, decision: DecisionPackage) {
  const values = [
    ["Trip Dates", `${spec.dates.start ?? "TBD"} to ${spec.dates.end ?? "TBD"}`],
    ["Group Size", spec.group.size ? String(spec.group.size) : "TBD"],
    ["Skill Levels", spec.group.skillLevels?.join(", ") ?? "TBD"],
    ["Budget", spec.budget.band ?? "TBD"],
    ["Travel", spec.travel.noFlying ? "No flying" : "Flying OK"],
    ["Top Resort Matches", decision.resortShortlist.join(", ") || "TBD"]
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Summary!A1",
    valueInputOption: "RAW",
    requestBody: { values }
  });
}

async function writeItineraries(sheets: any, spreadsheetId: string, decision: DecisionPackage) {
  const header = ["Option", "Resort", "Dates", "Lodging", "Summary", "Snow"];
  const rows = decision.itineraries.map((itinerary) => [
    itinerary.title,
    itinerary.resortName,
    itinerary.dateRange?.label ?? "TBD",
    itinerary.lodgingArea,
    itinerary.summary,
    itinerary.snowAssessment
  ]);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Itineraries!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] }
  });
}

async function writePois(sheets: any, spreadsheetId: string, decision: DecisionPackage) {
  const header = ["Type", "Name", "Rating", "Distance (mi)", "Hours", "Maps URL"];
  const rows = [
    ...decision.poiResults.gearShops.map((poi) => [
      "Gear",
      poi.name,
      poi.rating ?? "",
      poi.distanceMiles ?? "",
      poi.hours ?? "",
      (poi as any).mapsUrl ?? ""
    ]),
    ...decision.poiResults.groceries.map((poi) => [
      "Grocery",
      poi.name,
      poi.rating ?? "",
      poi.distanceMiles ?? "",
      poi.hours ?? "",
      (poi as any).mapsUrl ?? ""
    ]),
    ...decision.poiResults.restaurants.map((poi) => [
      "Restaurant",
      poi.name,
      poi.rating ?? "",
      poi.distanceMiles ?? "",
      poi.hours ?? "",
      (poi as any).mapsUrl ?? ""
    ])
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "POIs!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] }
  });
}

async function writeLogistics(
  sheets: any,
  spreadsheetId: string,
  spec: TripSpec,
  decision: DecisionPackage
) {
  const logistics = decision.itineraries.flatMap((itinerary) => itinerary.logistics);
  const warnings = decision.itineraries.flatMap((itinerary) => itinerary.warnings);
  const values = [
    ["Gear Rentals", spec.gear.rentalRequired ? "Required" : "Not required"],
    ["Travel Restrictions", spec.travel.restrictions?.join(", ") ?? "None noted"],
    ["Logistics Notes", logistics.join(" | ") || "TBD"],
    ["Warnings", warnings.join(" | ") || "None"]
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Logistics!A1",
    valueInputOption: "RAW",
    requestBody: { values }
  });
}
