import { TripSpec, updateTripSpecStatus } from "../../core/tripSpec";

export function detectIssue(spec: TripSpec): string | null {
  if (spec.dates.start && spec.dates.end && spec.dates.start > spec.dates.end) {
    return "I noticed the end date is before the start date. Could you confirm the correct date range?";
  }
  if (spec.travel.noFlying === true && spec.travel.arrivalAirport) {
    return `You mentioned no flying but also arriving via ${spec.travel.arrivalAirport}. Should I assume flying is okay?`;
  }
  return null;
}

export function autoConfirm(spec: TripSpec): TripSpec {
  const updated = { ...spec };

  const gearProvided =
    updated.gear.rentalRequired !== undefined ||
    typeof updated.gear.rentalCount === "number" ||
    typeof updated.gear.rentalShare === "number" ||
    Boolean(updated.gear.rentalNotes);
  if (typeof updated.gear.rentalCount === "number" && updated.gear.rentalRequired === undefined) {
    updated.gear = { ...updated.gear, rentalRequired: updated.gear.rentalCount > 0 };
  }
  if (gearProvided && updated.gear.confirmed !== true) {
    updated.gear = { ...updated.gear, confirmed: true };
  }

  if (
    (updated.budget.band || updated.budget.perPersonMax || updated.budget.totalMax) &&
    updated.budget.confirmed !== true
  ) {
    updated.budget = { ...updated.budget, confirmed: true };
  }

  const locationProvided = Boolean(
    updated.location.resort ||
      updated.location.region ||
      updated.location.state ||
      updated.location.openToSuggestions
  );
  if (locationProvided && updated.location.confirmed !== true) {
    updated.location = { ...updated.location, confirmed: true };
  }

  const travelProvided =
    typeof updated.travel.noFlying === "boolean" ||
    typeof updated.travel.maxDriveHours === "number" ||
    Boolean(updated.travel.restrictions?.length) ||
    Boolean(updated.travel.arrivalAirport) ||
    typeof updated.travel.canFlyCount === "number" ||
    typeof updated.travel.cannotFlyCount === "number";
  if (travelProvided && updated.travel.confirmed !== true) {
    updated.travel = { ...updated.travel, confirmed: true };
  }

  const passes = updated.notes.passes;
  const passesProvided = Boolean(
    passes &&
      (typeof passes.ikonCount === "number" ||
        typeof passes.epicCount === "number" ||
        typeof passes.indyCount === "number" ||
        typeof passes.mountainCollectiveCount === "number" ||
        typeof passes.noPassCount === "number" ||
        (Array.isArray(passes.otherPasses) && passes.otherPasses.length > 0) ||
        Boolean(passes.notes))
  );
  if (passes && passesProvided && passes.confirmed !== true) {
    updated.notes = { ...updated.notes, passes: { ...passes, confirmed: true } };
  }

  const lodgingProvided = Boolean(
    typeof updated.lodgingConstraints.maxWalkMinutesToLift === "number" ||
      typeof updated.lodgingConstraints.hotTubRequired === "boolean" ||
      typeof updated.lodgingConstraints.laundryRequired === "boolean" ||
      typeof updated.lodgingConstraints.minBedrooms === "number" ||
      typeof updated.lodgingConstraints.kitchenRequired === "boolean"
  );
  if (lodgingProvided && updated.lodgingConstraints.confirmed !== true) {
    updated.lodgingConstraints = {
      ...updated.lodgingConstraints,
      confirmed: true
    };
  }

  const diningProvided = Boolean(
    typeof updated.diningConstraints.mustSupportTakeout === "boolean" ||
      typeof updated.diningConstraints.minGroupCapacity === "number" ||
      typeof updated.diningConstraints.mustBeReservable === "boolean"
  );
  if (diningProvided && updated.diningConstraints.confirmed !== true) {
    updated.diningConstraints = {
      ...updated.diningConstraints,
      confirmed: true
    };
  }

  const organizerOpsProvided =
    typeof updated.organizerOps.wantsGroupChatSetup === "boolean" ||
    typeof updated.organizerOps.wantsSplitwiseSetup === "boolean";
  if (organizerOpsProvided && updated.organizerOps.confirmed !== true) {
    updated.organizerOps = { ...updated.organizerOps, confirmed: true };
  }

  return updateTripSpecStatus(updated);
}
