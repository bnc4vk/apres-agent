import dayjs from "dayjs";
import { TripSpecPatch } from "../core/tripSpec";

type DateSegment = "early" | "mid" | "late" | null;

const MONTHS: Array<{ month: number; names: string[] }> = [
  { month: 1, names: ["january", "jan"] },
  { month: 2, names: ["february", "feb"] },
  { month: 3, names: ["march", "mar"] },
  { month: 4, names: ["april", "apr"] },
  { month: 5, names: ["may"] },
  { month: 6, names: ["june", "jun"] },
  { month: 7, names: ["july", "jul"] },
  { month: 8, names: ["august", "aug"] },
  { month: 9, names: ["september", "sep", "sept"] },
  { month: 10, names: ["october", "oct"] },
  { month: 11, names: ["november", "nov"] },
  { month: 12, names: ["december", "dec"] }
];

const MONTH_REGEX = new RegExp(
  `\\b(${MONTHS.flatMap((entry) => entry.names).join("|")})\\b`,
  "i"
);

const MONTH_RANGE_REGEX = new RegExp(
  `\\b(${MONTHS.flatMap((entry) => entry.names).join("|")})\\b\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to|–|—)\\s*(\\d{1,2})(?:st|nd|rd|th)?`,
  "i"
);

const MONTH_DAY_REGEX = new RegExp(
  `\\b(${MONTHS.flatMap((entry) => entry.names).join("|")})\\b\\s*(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\b`,
  "i"
);

const YEAR_REGEX = /\b(19|20)\d{2}\b/;

export function resolveDatesPatch(
  message: string,
  currentDates: { start?: string; end?: string },
  now = new Date()
): TripSpecPatch | null {
  const text = message.toLowerCase();
  const hasDateCue = Boolean(
    MONTH_REGEX.test(text) ||
      /this month|next month|last month|this year|next year|last year|sometime|weekend|weekday|weekdays|weekends/.test(
        text
      )
  );
  if (!hasDateCue) return null;

  const explicitYearMatch = text.match(YEAR_REGEX);
  const explicitYear = explicitYearMatch ? Number(explicitYearMatch[0]) : null;

  const relativeMonth = parseRelativeMonth(text, now);
  const monthFromText = relativeMonth?.month ?? findMonthInText(text);
  const month = monthFromText;

  const segment = findSegment(text);
  const weekendPreference = findWeekendPreference(text);

  const year =
    explicitYear ??
    relativeMonth?.year ??
    (month ? inferYearForMonth(month, now, text) : null);

  const dateRange = resolveDateRange(text, month, year, segment);
  const existingStart = currentDates.start ?? "";
  const existingEnd = currentDates.end ?? "";

  if (!dateRange) {
    if (year && (text.includes("this year") || text.includes("next year") || text.includes("last year"))) {
      const updated = applyYearToExistingDates(existingStart, existingEnd, year);
      if (updated) {
        return {
          dates: {
            ...updated,
            weekendsPreferred: weekendPreference ?? undefined
          }
        };
      }
    }
    return null;
  }

  const patchDates: TripSpecPatch["dates"] = {
    start: dateRange.start,
    end: dateRange.end,
    kind: dateRange.kind,
    weekendsPreferred: weekendPreference ?? undefined
  };

  if (patchDates.start === existingStart && patchDates.end === existingEnd) {
    return null;
  }

  return { dates: patchDates };
}

function parseRelativeMonth(
  text: string,
  now: Date
): { month: number; year: number } | null {
  const current = dayjs(now);
  if (text.includes("this month")) {
    return { month: current.month() + 1, year: current.year() };
  }
  if (text.includes("next month")) {
    const next = current.add(1, "month");
    return { month: next.month() + 1, year: next.year() };
  }
  if (text.includes("last month")) {
    const prev = current.subtract(1, "month");
    return { month: prev.month() + 1, year: prev.year() };
  }
  return null;
}

function findMonthInText(text: string): number | null {
  const match = text.match(MONTH_REGEX);
  if (!match) return null;
  const name = match[1];
  const entry = MONTHS.find((monthEntry) => monthEntry.names.includes(name));
  return entry ? entry.month : null;
}

function inferYearForMonth(month: number, now: Date, text: string): number {
  const current = dayjs(now);
  const currentYear = current.year();
  const currentMonth = current.month() + 1;

  if (text.includes("next year")) return currentYear + 1;
  if (text.includes("last year")) return currentYear - 1;
  if (text.includes("this year")) return currentYear;

  return month >= currentMonth ? currentYear : currentYear + 1;
}

function resolveDateRange(
  text: string,
  month: number | null,
  year: number | null,
  segment: DateSegment
): { start: string; end: string; kind: "exact" | "window" } | null {
  if (!month || !year) return null;

  const rangeMatch = text.match(MONTH_RANGE_REGEX);
  if (rangeMatch) {
    const startDay = Number(rangeMatch[2]);
    const endDay = Number(rangeMatch[3]);
    return buildDayRange(year, month, startDay, endDay);
  }

  const dayMatch = text.match(MONTH_DAY_REGEX);
  if (dayMatch) {
    const day = Number(dayMatch[2]);
    return buildDayRange(year, month, day, day);
  }

  return buildMonthRange(year, month, segment);
}

function buildDayRange(
  year: number,
  month: number,
  startDay: number,
  endDay: number
): { start: string; end: string; kind: "exact" } {
  const base = dayjs(`${year}-${String(month).padStart(2, "0")}-01`);
  const daysInMonth = base.daysInMonth();
  const safeStart = Math.min(Math.max(startDay, 1), daysInMonth);
  const safeEnd = Math.min(Math.max(endDay, 1), daysInMonth);
  const start = base.date(Math.min(safeStart, safeEnd));
  const end = base.date(Math.max(safeStart, safeEnd));
  return {
    start: start.format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD"),
    kind: "exact"
  };
}

function buildMonthRange(
  year: number,
  month: number,
  segment: DateSegment
): { start: string; end: string; kind: "window" } {
  const base = dayjs(`${year}-${String(month).padStart(2, "0")}-01`);
  const daysInMonth = base.daysInMonth();
  let startDay = 1;
  let endDay = daysInMonth;
  if (segment === "early") {
    endDay = Math.min(10, daysInMonth);
  } else if (segment === "mid") {
    startDay = Math.min(11, daysInMonth);
    endDay = Math.min(20, daysInMonth);
  } else if (segment === "late") {
    startDay = Math.min(21, daysInMonth);
  }

  return {
    start: base.date(startDay).format("YYYY-MM-DD"),
    end: base.date(endDay).format("YYYY-MM-DD"),
    kind: "window"
  };
}

function findSegment(text: string): DateSegment {
  if (text.includes("early")) return "early";
  if (text.includes("mid") || text.includes("middle")) return "mid";
  if (text.includes("late") || text.includes("end of")) return "late";
  return null;
}

function findWeekendPreference(text: string): boolean | null {
  if (text.includes("weekend") || text.includes("weekends")) return true;
  if (text.includes("weekday") || text.includes("weekdays")) return false;
  return null;
}

function applyYearToExistingDates(
  start: string,
  end: string,
  year: number
): { start: string; end: string; kind: "exact" | "window" } | null {
  if (!start || !end) return null;
  const startParts = start.split("-");
  const endParts = end.split("-");
  if (startParts.length < 2 || endParts.length < 2) return null;
  const startMonth = Number(startParts[1]);
  const endMonth = Number(endParts[1]);
  if (!startMonth || !endMonth) return null;

  const startDay = startParts.length >= 3 ? Number(startParts[2]) : 1;
  const endDay = endParts.length >= 3 ? Number(endParts[2]) : startDay;

  const resolved = buildDayRange(year, startMonth, startDay, endDay);
  return { start: resolved.start, end: resolved.end, kind: resolved.kind };
}
