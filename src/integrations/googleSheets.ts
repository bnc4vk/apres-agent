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
  const drive = google.drive({ version: "v3", auth });
  const title = buildSheetTitle(spec, decision);

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: "Summary" } },
        { properties: { title: "Itineraries" } },
        { properties: { title: "Decision Matrix" } },
        { properties: { title: "POIs" } },
        { properties: { title: "Vendors" } },
        { properties: { title: "Tasks" } },
        { properties: { title: "Costs" } },
        { properties: { title: "Comms" } },
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
    writeDecisionMatrix(sheets, spreadsheetId, decision),
    writePois(sheets, spreadsheetId, decision),
    writeVendors(sheets, spreadsheetId, decision),
    writeTasks(sheets, spreadsheetId, decision),
    writeCosts(sheets, spreadsheetId, decision),
    writeComms(sheets, spreadsheetId, decision),
    writeLogistics(sheets, spreadsheetId, spec, decision)
  ]);
  await grantEditorAccess(drive, spreadsheetId);

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
    ["Budget Check", decision.budgetSummary.summaryLine ?? "TBD"],
    [
      "Passes",
      spec.notes.passes
        ? `Ikon ${spec.notes.passes.ikonCount ?? 0}, Epic ${spec.notes.passes.epicCount ?? 0}, Indy ${spec.notes.passes.indyCount ?? 0}, No pass ${spec.notes.passes.noPassCount ?? 0}`
        : "TBD"
    ],
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
  const header = [
    "Option",
    "Resort",
    "Dates",
    "Lodging",
    "Summary",
    "Snow",
    "Budget per person",
    "Total est. per person",
    "Budget feasible",
    "Pass",
    "Travel",
    "Food",
    "Gear",
    "Housing",
    "Lodging search",
    "Car rental compare",
    "Gear shops",
    "Groceries",
    "Takeout restaurants",
    "Lodging source",
    "Cars source",
    "Data fetched at"
  ];
  const rows = decision.itineraries.map((itinerary) => [
    itinerary.title,
    itinerary.resortName,
    itinerary.dateRange?.label ?? "TBD",
    itinerary.lodgingArea,
    itinerary.summary,
    itinerary.snowAssessment,
    itinerary.lodgingBudgetPerPerson ?? "",
    itinerary.budgetEstimate.perPersonTotal ?? "",
    itinerary.budgetEstimate.feasible === null ? "" : itinerary.budgetEstimate.feasible ? "Yes" : "No",
    itinerary.budgetEstimate.components.pass ?? "",
    itinerary.budgetEstimate.components.travel ?? "",
    itinerary.budgetEstimate.components.food ?? "",
    itinerary.budgetEstimate.components.gear_rental ?? "",
    itinerary.budgetEstimate.components.housing ?? "",
    itinerary.researchLinks.lodgingSearch,
    itinerary.researchLinks.carRentalCompare ?? "",
    itinerary.researchLinks.gearSearch,
    itinerary.researchLinks.grocerySearch,
    itinerary.researchLinks.takeoutSearch,
    itinerary.liveOptions?.lodging?.[0]?.sourceMeta.source ?? "estimated",
    itinerary.liveOptions?.cars?.[0]?.sourceMeta.source ?? "estimated",
    itinerary.liveOptions?.lodging?.[0]?.sourceMeta.fetchedAt ?? ""
  ]);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Itineraries!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] }
  });
}

async function writeDecisionMatrix(sheets: any, spreadsheetId: string, decision: DecisionPackage) {
  const header = [
    "Itinerary ID",
    "Resort",
    "Total cost pp",
    "Lodging fit",
    "Pass fit",
    "Travel burden",
    "Amenity fit",
    "Walkability",
    "Locked"
  ];
  const rows = (decision.decisionMatrix ?? []).map((row) => [
    row.itineraryId,
    row.resortName,
    row.totalCostPerPerson ?? "",
    row.lodgingFitScore,
    row.passFitScore,
    row.travelBurdenScore,
    row.amenityFitScore,
    row.walkabilityScore,
    row.locked ? "Yes" : "No"
  ]);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Decision Matrix!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] }
  });
}

async function writePois(sheets: any, spreadsheetId: string, decision: DecisionPackage) {
  const header = [
    "Type",
    "Name",
    "Rating",
    "Distance (mi)",
    "Hours",
    "Maps URL",
    "Takeout",
    "Reservable",
    "Dine In",
    "Group Capacity",
    "Source",
    "Fetched At"
  ];
  const rows = [
    ...decision.poiResults.gearShops.map((poi) => [
      "Gear",
      poi.name,
      poi.rating ?? "",
      poi.distanceMiles ?? "",
      poi.hours ?? "",
      (poi as any).mapsUrl ?? "",
      poi.supportsTakeout ?? "",
      poi.reservable ?? "",
      poi.dineIn ?? "",
      poi.groupCapacityEstimate ?? "",
      poi.sourceMeta?.source ?? "",
      poi.sourceMeta?.fetchedAt ?? ""
    ]),
    ...decision.poiResults.groceries.map((poi) => [
      "Grocery",
      poi.name,
      poi.rating ?? "",
      poi.distanceMiles ?? "",
      poi.hours ?? "",
      (poi as any).mapsUrl ?? "",
      poi.supportsTakeout ?? "",
      poi.reservable ?? "",
      poi.dineIn ?? "",
      poi.groupCapacityEstimate ?? "",
      poi.sourceMeta?.source ?? "",
      poi.sourceMeta?.fetchedAt ?? ""
    ]),
    ...decision.poiResults.restaurants.map((poi) => [
      "Restaurant",
      poi.name,
      poi.rating ?? "",
      poi.distanceMiles ?? "",
      poi.hours ?? "",
      (poi as any).mapsUrl ?? "",
      poi.supportsTakeout ?? "",
      poi.reservable ?? "",
      poi.dineIn ?? "",
      poi.groupCapacityEstimate ?? "",
      poi.sourceMeta?.source ?? "",
      poi.sourceMeta?.fetchedAt ?? ""
    ])
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "POIs!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] }
  });
}

async function writeVendors(sheets: any, spreadsheetId: string, decision: DecisionPackage) {
  const header = ["Type", "Itinerary", "Name", "Price", "URL", "Source", "Fetched At"];
  const rows = decision.itineraries.flatMap((itinerary) => [
    ...(itinerary.liveOptions?.lodging ?? []).slice(0, 3).map((lodging) => [
      "Lodging",
      itinerary.title,
      lodging.name,
      lodging.nightlyRateUsd,
      lodging.bookingUrl ?? "",
      lodging.sourceMeta.source,
      lodging.sourceMeta.fetchedAt
    ]),
    ...(itinerary.liveOptions?.cars ?? []).slice(0, 3).map((car) => [
      "Car",
      itinerary.title,
      `${car.provider} ${car.vehicleClass}`,
      car.totalPriceUsd,
      car.bookingUrl ?? "",
      car.sourceMeta.source,
      car.sourceMeta.fetchedAt
    ])
  ]);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Vendors!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] }
  });
}

async function writeTasks(sheets: any, spreadsheetId: string, decision: DecisionPackage) {
  const header = ["Task", "Owner", "Due date", "Status", "Notes"];
  const rows = (decision.opsBoard.tasks ?? []).map((task) => [
    task.title,
    task.owner,
    task.dueDate ?? "",
    task.status,
    task.notes
  ]);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Tasks!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] }
  });
}

async function writeCosts(sheets: any, spreadsheetId: string, decision: DecisionPackage) {
  const header = ["Summary", "Value"];
  const values = [
    ["Best itinerary", decision.budgetSummary.bestResortName ?? ""],
    ["Best per person total", decision.budgetSummary.bestPerPersonTotal],
    ["Best group total", decision.budgetSummary.bestGroupTotal],
    ["Feasible", decision.budgetSummary.feasible ? "Yes" : "No"],
    ["Target per person", decision.budgetSummary.targetPerPerson ?? ""],
    ["Shortfall per person", decision.budgetSummary.shortfallPerPerson ?? ""],
    ["Summary line", decision.budgetSummary.summaryLine]
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Costs!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header, ...values] }
  });
}

async function writeComms(sheets: any, spreadsheetId: string, decision: DecisionPackage) {
  const header = ["Type", "Enabled", "Status / Link"];
  const values = [
    [
      "Group chat",
      decision.opsBoard.chatBootstrap.enabled ? "Yes" : "No",
      decision.opsBoard.chatBootstrap.inviteUrl ?? decision.opsBoard.chatBootstrap.provider
    ],
    [
      "Splitwise",
      decision.opsBoard.splitwiseBootstrap.enabled ? "Yes" : "No",
      decision.opsBoard.splitwiseBootstrap.groupId ?? decision.opsBoard.splitwiseBootstrap.status
    ]
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Comms!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header, ...values] }
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

async function grantEditorAccess(drive: any, spreadsheetId: string): Promise<void> {
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      type: "anyone",
      role: "writer"
    }
  });
}
