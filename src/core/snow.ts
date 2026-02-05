import dayjs from "dayjs";
import { Resort } from "./resorts";
import { TripSpec } from "./tripSpec";

export type SnowScore = {
  score: number;
  snowOk: boolean;
  avgTempOk: boolean;
  monthEvaluated: number | null;
};

const SNOW_MIN_INCHES = 12;
const MAX_AVG_TEMP_F = 50;

export function scoreResortForTrip(spec: TripSpec, resort: Resort, dateOverride?: string): SnowScore {
  const month = getTripStartMonth(spec, dateOverride);
  if (!month) {
    return { score: 0.5, snowOk: false, avgTempOk: false, monthEvaluated: null };
  }

  const snowInches = resort.monthlySnowInches[month] ?? 0;
  const avgTemp = resort.monthlyAvgTempF[month] ?? 99;
  const snowOk = snowInches >= SNOW_MIN_INCHES;
  const avgTempOk = avgTemp <= MAX_AVG_TEMP_F;

  let score = 0.4;
  if (snowOk) score += 0.3;
  if (avgTempOk) score += 0.2;

  const skillScore = scoreSkillFit(spec, resort);
  score += skillScore * 0.4;

  return {
    score: clamp(score, 0, 1),
    snowOk,
    avgTempOk,
    monthEvaluated: month
  };
}

function scoreSkillFit(spec: TripSpec, resort: Resort): number {
  const levels = spec.group.skillLevels ?? [];
  if (levels.length === 0) return 0.5;
  const values = levels.map((level) => resort.terrain[level]);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getTripStartMonth(spec: TripSpec, dateOverride?: string): number | null {
  const dateValue = dateOverride ?? spec.dates.start;
  if (!dateValue) return null;
  const date = dayjs(dateValue);
  if (!date.isValid()) return null;
  return date.month() + 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
