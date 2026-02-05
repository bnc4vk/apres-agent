import dayjs from "dayjs";
import { TripSpec } from "./tripSpec";

export type ValidationIssue = {
  field: string;
  message: string;
};

export function validateTripSpec(spec: TripSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (spec.dates.start && spec.dates.end) {
    const start = dayjs(spec.dates.start);
    const end = dayjs(spec.dates.end);
    if (start.isAfter(end)) {
      issues.push({ field: "dates", message: "Start date must be before end date." });
    }
  }

  if (spec.group.size && spec.group.size > 20) {
    issues.push({ field: "group_size", message: "Group size exceeds current supported limit." });
  }

  if (spec.travel.maxDriveHours && spec.travel.maxDriveHours > 12) {
    issues.push({ field: "travel_restrictions", message: "Drive time cap seems unusually high." });
  }

  return issues;
}
