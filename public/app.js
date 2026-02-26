const intakeForm = document.getElementById("trip-intake-form");
const intakeError = document.getElementById("intake-error");
const generateBtn = document.getElementById("generate-itineraries-btn");
const passPresetField = document.getElementById("pass-preset");
const passBreakdownField = document.getElementById("pass-breakdown-field");
const dateRangePicker = document.getElementById("trip-date-range-picker");
const startDateField = document.getElementById("trip-start-date");
const endDateField = document.getElementById("trip-end-date");

let datePickerMonthCursor = null;

const DATE_PICKER_MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const DATE_PICKER_DAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "short" });

init();

function init() {
  if (!intakeForm) return;

  intakeForm.addEventListener("submit", onSubmit);
  passPresetField?.addEventListener("change", syncPassBreakdownField);
  startDateField?.addEventListener("change", () => syncDateRangePicker(true));
  endDateField?.addEventListener("change", () => syncDateRangePicker(true));
  dateRangePicker?.addEventListener("click", onDateRangePickerClick);

  syncPassBreakdownField();
  syncDateRangePicker();
}

async function onSubmit(event) {
  event.preventDefault();
  clearError();

  const payload = buildPayload();
  if (!payload.ok) {
    showError(payload.error);
    return;
  }

  setBusy(true);
  try {
    const response = await fetch("/api/generate-itinerary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.data)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Generation failed.");
    }
    window.location.assign(`/results/${encodeURIComponent(data.resultId)}`);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Generation failed.");
  } finally {
    setBusy(false);
  }
}

function buildPayload() {
  if (!intakeForm) return { ok: false, error: "Form unavailable." };
  const fd = new FormData(intakeForm);

  const startDate = stringValue(fd.get("start_date"));
  const endDate = stringValue(fd.get("end_date"));
  const groupSize = optionalInt(fd.get("group_size"));
  const budgetPerPerson = optionalInt(fd.get("budget_per_person"));
  const skillLevels = Array.from(intakeForm.querySelectorAll("input[name='skill_levels']:checked"))
    .map((el) => el.value)
    .filter(Boolean);
  const openToSuggestions = fd.get("open_to_suggestions") === "on";
  const destinationPreference = stringValue(fd.get("destination_preference"));

  if (!startDate || !endDate) return { ok: false, error: "Start and end dates are required." };
  if (!groupSize || groupSize < 1) return { ok: false, error: "Group size must be at least 1." };
  if (!budgetPerPerson || budgetPerPerson < 1) return { ok: false, error: "Per-person budget is required." };
  if (skillLevels.length === 0) return { ok: false, error: "Select at least one skill level." };
  if (!openToSuggestions && !destinationPreference) {
    return { ok: false, error: "Add a destination preference or enable destination suggestions." };
  }

  const passPreset = stringValue(fd.get("pass_preset"));
  const passBreakdown = stringValue(fd.get("pass_breakdown"));
  if (passPreset === "explicit_breakdown" && !passBreakdown) {
    return { ok: false, error: "Pass breakdown is required for explicit breakdown." };
  }

  return {
    ok: true,
    data: {
      startDate,
      endDate,
      destinationPreference: destinationPreference || undefined,
      openToSuggestions,
      groupSize,
      groupRiderMix: stringValue(fd.get("group_rider_mix")) || undefined,
      skillLevels,
      budgetPerPerson,
      passPreset: passPreset || undefined,
      passBreakdown: passBreakdown || undefined,
      travelMode: stringValue(fd.get("travel_mode")) || undefined,
      maxDriveHours: optionalInt(fd.get("max_drive_hours")),
      lodgingStylePreference: stringValue(fd.get("lodging_style_preference")) || undefined,
      minBedrooms: optionalInt(fd.get("min_bedrooms")),
      maxWalkMinutes: optionalInt(fd.get("max_walk_minutes")),
      hotTubRequired: fd.get("hot_tub_required") === "on",
      kitchenRequired: fd.get("kitchen_required") === "on",
      laundryRequired: fd.get("laundry_required") === "on",
      rentalRequired: stringValue(fd.get("rental_required")) || undefined,
      rentalCount: optionalInt(fd.get("rental_count")),
      rentalType: stringValue(fd.get("rental_type")) || undefined
    }
  };
}

function setBusy(busy) {
  if (!intakeForm || !generateBtn) return;
  intakeForm.querySelectorAll("input, select, textarea, button").forEach((el) => {
    el.disabled = busy;
  });
  generateBtn.textContent = busy ? "Generating..." : "Generate with ChatGPT 5.2";
}

function showError(message) {
  if (!intakeError) return;
  intakeError.hidden = false;
  intakeError.textContent = message;
}

function clearError() {
  if (!intakeError) return;
  intakeError.hidden = true;
  intakeError.textContent = "";
}

function stringValue(value) {
  return String(value ?? "").trim();
}

function optionalInt(value) {
  const raw = stringValue(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function syncPassBreakdownField() {
  if (!passPresetField || !passBreakdownField) return;
  const show = passPresetField.value === "explicit_breakdown";
  passBreakdownField.hidden = !show;
  passBreakdownField.querySelectorAll("textarea, input").forEach((el) => {
    el.disabled = !show;
  });
}

function onDateRangePickerClick(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest("button") : null;
  if (!target) return;

  if (target.dataset.nav === "prev") {
    datePickerMonthCursor = addCalendarMonths(getDatePickerAnchorMonth(), -1);
    renderDateRangePicker();
    return;
  }
  if (target.dataset.nav === "next") {
    datePickerMonthCursor = addCalendarMonths(getDatePickerAnchorMonth(), 1);
    renderDateRangePicker();
    return;
  }
  if (target.dataset.date) {
    applyDateRangeSelection(target.dataset.date);
  }
}

function syncDateRangePicker(preferSelectedMonth = false) {
  if (!dateRangePicker) return;
  const selected = getSelectedDateRange();
  if (!datePickerMonthCursor || preferSelectedMonth) {
    datePickerMonthCursor = startOfCalendarMonth(selected.start || new Date());
  }
  renderDateRangePicker();
}

function renderDateRangePicker() {
  if (!dateRangePicker) return;
  const anchorMonth = getDatePickerAnchorMonth();
  const nextMonth = addCalendarMonths(anchorMonth, 1);
  const selected = getSelectedDateRange();

  dateRangePicker.innerHTML = `
    <div class="date-range-picker-header">
      <button type="button" class="date-nav-btn" data-nav="prev" aria-label="Show previous month">&#8249;</button>
      <strong>Select date range</strong>
      <button type="button" class="date-nav-btn" data-nav="next" aria-label="Show next month">&#8250;</button>
    </div>
    <div class="date-picker-months">
      ${renderDatePickerMonth(anchorMonth, selected)}
      ${renderDatePickerMonth(nextMonth, selected)}
    </div>
  `;
}

function renderDatePickerMonth(monthDate, selected) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(2024, 0, 7 + i);
    return `<span>${DATE_PICKER_DAY_FORMATTER.format(date).slice(0, 2)}</span>`;
  }).join("");

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push('<button type="button" class="date-day is-empty" tabindex="-1" disabled></button>');
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, month, day);
    const iso = formatIsoDate(date);
    const classNames = ["date-day"];
    if (isTodayDate(date)) classNames.push("is-today");
    if (isDateInRange(date, selected.start, selected.end)) classNames.push("is-in-range");
    if (selected.start && sameCalendarDate(date, selected.start)) classNames.push("is-start");
    if (selected.end && sameCalendarDate(date, selected.end)) classNames.push("is-end");
    if (selected.start && !selected.end && sameCalendarDate(date, selected.start)) classNames.push("is-selected");
    if (selected.start && selected.end && sameCalendarDate(selected.start, selected.end) && sameCalendarDate(date, selected.start)) {
      classNames.push("is-selected");
    }
    cells.push(
      `<button type="button" class="${classNames.join(" ")}" data-date="${iso}" aria-label="${DATE_PICKER_MONTH_FORMATTER.format(date)} ${day}">${day}</button>`
    );
  }

  return `
    <section class="date-picker-month" aria-label="${DATE_PICKER_MONTH_FORMATTER.format(monthDate)}">
      <p class="date-picker-month-title">${DATE_PICKER_MONTH_FORMATTER.format(monthDate)}</p>
      <div class="date-picker-weekdays">${weekdayLabels}</div>
      <div class="date-picker-days">${cells.join("")}</div>
    </section>
  `;
}

function applyDateRangeSelection(isoDate) {
  if (!startDateField || !endDateField) return;
  const clicked = parseIsoDate(isoDate);
  if (!clicked) return;

  const current = getSelectedDateRange();
  if (!current.start || (current.start && current.end)) {
    startDateField.value = formatIsoDate(clicked);
    endDateField.value = "";
    syncDateRangePicker(false);
    return;
  }

  const start = current.start;
  if (compareCalendarDates(clicked, start) < 0) {
    startDateField.value = formatIsoDate(clicked);
    endDateField.value = formatIsoDate(start);
  } else {
    startDateField.value = formatIsoDate(start);
    endDateField.value = formatIsoDate(clicked);
  }
  syncDateRangePicker(false);
}

function getSelectedDateRange() {
  const start = parseIsoDate(startDateField?.value || "");
  const end = parseIsoDate(endDateField?.value || "");
  if (start && end && compareCalendarDates(end, start) < 0) {
    return { start: end, end: start };
  }
  return { start, end };
}

function getDatePickerAnchorMonth() {
  return datePickerMonthCursor ? startOfCalendarMonth(datePickerMonthCursor) : startOfCalendarMonth(new Date());
}

function parseIsoDate(value) {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfCalendarMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addCalendarMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function sameCalendarDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function compareCalendarDates(a, b) {
  const aKey = a.getFullYear() * 10000 + (a.getMonth() + 1) * 100 + a.getDate();
  const bKey = b.getFullYear() * 10000 + (b.getMonth() + 1) * 100 + b.getDate();
  return aKey - bKey;
}

function isDateInRange(date, start, end) {
  if (!start || !end) return false;
  return compareCalendarDates(date, start) > 0 && compareCalendarDates(date, end) < 0;
}

function isTodayDate(date) {
  return sameCalendarDate(date, new Date());
}
