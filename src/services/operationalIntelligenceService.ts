import dayjs from "dayjs";
import { getConversationStore } from "../adapters/persistence";
import { loadConversationByTripId } from "../conversations/sessionService";
import { buildDecisionPackage } from "../core/decision";
import { findResortByName } from "../core/resorts";
import type { WorkflowOperationalCheck } from "../core/tripWorkflow";
import { attachWorkflowState } from "../core/tripWorkflow";
import { enrichDecisionPackageWithLLMReview } from "./decisionReviewService";

type AirportCoord = { code: string; lat: number; lng: number; name: string };

const AIRPORTS: Record<string, AirportCoord> = {
  DEN: { code: "DEN", lat: 39.8561, lng: -104.6737, name: "Denver International" },
  EGE: { code: "EGE", lat: 39.6426, lng: -106.9177, name: "Eagle County Regional" },
  HDN: { code: "HDN", lat: 40.4812, lng: -107.2189, name: "Yampa Valley" },
  SLC: { code: "SLC", lat: 40.7899, lng: -111.9791, name: "Salt Lake City" },
  RNO: { code: "RNO", lat: 39.4986, lng: -119.7681, name: "Reno-Tahoe" }
};

const RESORT_STATUS_PAGES: Record<string, string> = {
  "Palisades Tahoe": "https://www.palisadestahoe.com/mountain-information/conditions-weather",
  Heavenly: "https://www.skiheavenly.com/the-mountain/mountain-conditions/snow-and-weather-report.aspx",
  Northstar: "https://www.northstarcalifornia.com/the-mountain/mountain-conditions/snow-and-weather-report.aspx",
  Breckenridge: "https://www.breckenridge.com/the-mountain/mountain-conditions/snow-and-weather-report.aspx",
  Keystone: "https://www.keystoneresort.com/the-mountain/mountain-conditions/snow-and-weather-report.aspx",
  Vail: "https://www.vail.com/the-mountain/mountain-conditions/snow-and-weather-report.aspx",
  "Copper Mountain": "https://www.coppercolorado.com/the-mountain/conditions-weather",
  "Winter Park": "https://www.winterparkresort.com/the-mountain/mountain-report",
  Steamboat: "https://www.steamboat.com/the-mountain/mountain-report",
  "Park City": "https://www.parkcitymountain.com/the-mountain/mountain-conditions/snow-and-weather-report.aspx",
  "Deer Valley": "https://www.deervalley.com/mountain-report",
  Snowbird: "https://www.snowbird.com/mountain-report/"
};

export async function refreshTripOperationalLive(tripId: string) {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  let decisionPackage = loaded.conversation.decisionPackage;
  if (!decisionPackage) {
    decisionPackage = await enrichDecisionPackageWithLLMReview(loaded.conversation.tripSpec, await buildDecisionPackage(loaded.conversation.tripSpec));
  }
  decisionPackage = attachWorkflowState(loaded.conversation.tripSpec, decisionPackage, {
    previousDecisionPackage: loaded.conversation.decisionPackage ?? decisionPackage,
    trigger: "workflow_refresh"
  });

  const primaryItinerary = decisionPackage.itineraries[0];
  const resort = primaryItinerary ? findResortByName(primaryItinerary.resortName) : null;
  const airportCode = loaded.conversation.tripSpec.travel.arrivalAirport || resort?.nearestAirport || null;
  const airport = airportCode ? AIRPORTS[airportCode] ?? null : null;

  const [forecast, liftPageProbe] = await Promise.all([
    resort ? fetchOpenMeteoForecast(resort.lat, resort.lng) : Promise.resolve(null),
    resort ? probeStatusPage(RESORT_STATUS_PAGES[resort.name]) : Promise.resolve(null)
  ]);

  if (!decisionPackage.workflow) {
    await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
    return {
      tripId: loaded.conversation.id,
      sessionId: loaded.sessionId,
      tripSpec: loaded.conversation.tripSpec,
      decisionPackage,
      googleLinked: loaded.googleLinked,
      sheetUrl: loaded.conversation.sheetUrl ?? null
    };
  }

  const checks = decisionPackage.workflow.operations.checks.slice();
  upsertCheck(checks, buildWeatherSnowCheck(forecast));
  upsertCheck(checks, buildRoadsCheck(loaded.conversation.tripSpec.travel.noFlying === true, forecast));
  upsertCheck(checks, await buildLiftOpsCheck(liftPageProbe, forecast, resort?.name ?? null));
  upsertCheck(checks, buildAirportTimingCheck(loaded.conversation.tripSpec.travel.noFlying !== true, airport, resort ? { lat: resort.lat, lng: resort.lng, name: resort.name } : null));

  const warningCount = checks.filter((check) => check.key !== "trip_week_readiness" && check.status === "warning").length;
  const watchCount = checks.filter((check) => check.key !== "trip_week_readiness" && check.status === "watch").length;
  const readiness = checks.find((check) => check.key === "trip_week_readiness");
  if (readiness) {
    readiness.source = "live";
    readiness.checkedAt = new Date().toISOString();
    readiness.status = warningCount > 0 ? "warning" : watchCount > 1 ? "watch" : "ok";
    readiness.summary = `Live refresh complete: ${warningCount} warning(s), ${watchCount} watch item(s). ${readiness.summary}`;
  }
  decisionPackage.workflow.operations.checks = checks;
  decisionPackage.workflow.operations.lastLiveRefreshAt = new Date().toISOString();
  if (decisionPackage.workflow.operations.tripWeekChecklist) {
    const item = decisionPackage.workflow.operations.tripWeekChecklist.find((entry) => entry.id === "weather_refreshed");
    if (item) {
      item.status = "done";
      item.detail = `Live ops refreshed ${decisionPackage.workflow.operations.lastLiveRefreshAt}`;
    }
  }

  const notices = decisionPackage.workflow.integrations.messaging.linkRefreshNotices;
  const opsWarnings = checks.filter((check) => check.status === "warning" || check.status === "watch").slice(0, 2);
  for (const warning of opsWarnings) {
    const message = `${warning.label}: ${warning.summary}`;
    if (!notices.some((n) => n.message === message)) {
      notices.push({ label: warning.label, message });
    }
  }
  decisionPackage.workflow.integrations.messaging.linkRefreshNotices = notices.slice(-10);

  await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
  return {
    tripId: loaded.conversation.id,
    sessionId: loaded.sessionId,
    tripSpec: loaded.conversation.tripSpec,
    decisionPackage,
    googleLinked: loaded.googleLinked,
    sheetUrl: loaded.conversation.sheetUrl ?? null
  };
}

function upsertCheck(checks: WorkflowOperationalCheck[], next: WorkflowOperationalCheck | null) {
  if (!next) return;
  const index = checks.findIndex((check) => check.key === next.key);
  if (index >= 0) checks[index] = next;
  else checks.push(next);
}

function buildWeatherSnowCheck(forecast: ForecastSummary | null): WorkflowOperationalCheck | null {
  const now = new Date().toISOString();
  if (!forecast) {
    return {
      key: "weather_snow",
      label: "Weather / Snow",
      status: "unknown",
      summary: "Live forecast unavailable. Retry refresh or rely on heuristic checks.",
      checkedAt: now,
      source: "live"
    };
  }
  const upcomingSnow = forecast.daily.slice(0, 5).reduce((sum, day) => sum + day.snowfallIn, 0);
  const heavyDay = forecast.daily.find((day) => day.snowfallIn >= 6 || day.precipIn >= 0.8);
  const warmRainRisk = forecast.daily.some((day) => day.maxTempF >= 38 && day.precipIn > 0.3);
  const status = heavyDay ? "watch" : warmRainRisk ? "warning" : "ok";
  const summary =
    status === "ok"
      ? `Forecast looks manageable. ${upcomingSnow.toFixed(1)}\" projected snowfall over next 5 days.`
      : heavyDay
        ? `Heavy snow / storm risk around ${heavyDay.date} (${heavyDay.snowfallIn.toFixed(1)}\" snow, ${heavyDay.precipIn.toFixed(2)}\" precip).`
        : "Warm + wet forecast may affect snow quality and roads.";
  return {
    key: "weather_snow",
    label: "Weather / Snow",
    status,
    summary,
    checkedAt: now,
    source: "live",
    detailUrl: forecast.sourceUrl
  };
}

function buildRoadsCheck(drivingTrip: boolean, forecast: ForecastSummary | null): WorkflowOperationalCheck {
  const now = new Date().toISOString();
  if (!forecast) {
    return {
      key: "roads",
      label: "Road Conditions / Chains",
      status: drivingTrip ? "watch" : "unknown",
      summary: drivingTrip ? "Forecast unavailable. Manually check DOT chain controls before departure." : "Road conditions depend on mountain transfer route.",
      checkedAt: now,
      source: "live"
    };
  }
  const chainRiskDay = forecast.daily.find((day) => day.snowfallIn >= 3 && day.minTempF <= 34);
  const status = chainRiskDay ? "warning" : drivingTrip ? "ok" : "watch";
  const summary = chainRiskDay
    ? `Chain requirement risk on/near ${chainRiskDay.date} due to snow + freezing temps.`
    : drivingTrip
      ? "No immediate chain trigger in forecast window, but monitor local DOT controls."
      : "Airport-to-resort transfer roads look manageable in current forecast window.";
  return {
    key: "roads",
    label: "Road Conditions / Chains",
    status,
    summary,
    checkedAt: now,
    source: "live",
    detailUrl: forecast.sourceUrl
  };
}

async function buildLiftOpsCheck(
  pageProbe: { ok: boolean; status?: number; url?: string; error?: string } | null,
  forecast: ForecastSummary | null,
  resortName: string | null
): Promise<WorkflowOperationalCheck> {
  const now = new Date().toISOString();
  const stormRisk = Boolean(forecast?.daily.some((day) => day.snowfallIn >= 6 || day.windMph >= 35));
  if (!pageProbe) {
    return {
      key: "lift_ops",
      label: "Lift Operations",
      status: stormRisk ? "watch" : "unknown",
      summary: resortName
        ? `No lift-ops page configured for ${resortName}. ${stormRisk ? "Storm/wind risk may impact operations." : "Check resort mountain report manually."}`
        : "No resort selected for lift operations check.",
      checkedAt: now,
      source: "live"
    };
  }
  const status = !pageProbe.ok ? "warning" : stormRisk ? "watch" : "ok";
  const summary = !pageProbe.ok
    ? `Resort status page check failed${pageProbe.status ? ` (HTTP ${pageProbe.status})` : ""}. Verify operations manually.`
    : stormRisk
      ? `Resort status page reachable. Forecast indicates wind/storm risk that may affect lifts.`
      : `Resort status page reachable and no immediate weather-based lift disruption signal.`;
  return {
    key: "lift_ops",
    label: "Lift Operations",
    status,
    summary,
    checkedAt: now,
    source: "live",
    detailUrl: pageProbe.url ?? null
  };
}

function buildAirportTimingCheck(
  flyingTrip: boolean,
  airport: AirportCoord | null,
  resort: { lat: number; lng: number; name: string } | null
): WorkflowOperationalCheck {
  const now = new Date().toISOString();
  if (!flyingTrip) {
    return {
      key: "airport_timing",
      label: "Airport Arrival + Car Pickup",
      status: "ok",
      summary: "Driving-only trip; airport pickup timing check not required.",
      checkedAt: now,
      source: "live"
    };
  }
  if (!airport || !resort) {
    return {
      key: "airport_timing",
      label: "Airport Arrival + Car Pickup",
      status: "warning",
      summary: "Missing airport or resort lock. Finalize arrival airport/resort to estimate pickup and transfer buffers.",
      checkedAt: now,
      source: "live"
    };
  }
  const miles = haversineMiles(airport.lat, airport.lng, resort.lat, resort.lng);
  const baseDriveHours = Math.max(1, Math.round((miles / 42) * 10) / 10);
  const bufferHours = miles > 120 ? 2.25 : miles > 70 ? 1.75 : 1.25;
  const status = miles > 140 ? "watch" : "ok";
  return {
    key: "airport_timing",
    label: "Airport Arrival + Car Pickup",
    status,
    summary: `Estimate ${baseDriveHours}h drive from ${airport.code} to ${resort.name}. Plan ~${bufferHours}h car pickup + mountain transfer buffer after landing.`,
    checkedAt: now,
    source: "live"
  };
}

async function fetchOpenMeteoForecast(lat: number, lng: number): Promise<ForecastSummary | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,snowfall_sum,precipitation_sum,windspeed_10m_max");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "7");
  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = (await response.json()) as any;
    const time = json?.daily?.time ?? [];
    const max = json?.daily?.temperature_2m_max ?? [];
    const min = json?.daily?.temperature_2m_min ?? [];
    const snow = json?.daily?.snowfall_sum ?? [];
    const precip = json?.daily?.precipitation_sum ?? [];
    const wind = json?.daily?.windspeed_10m_max ?? [];
    const daily = time.map((date: string, i: number) => ({
      date,
      maxTempF: Number(max[i] ?? 0),
      minTempF: Number(min[i] ?? 0),
      snowfallIn: Number(snow[i] ?? 0),
      precipIn: Number(precip[i] ?? 0),
      windMph: Number(wind[i] ?? 0)
    }));
    return { daily, sourceUrl: url.toString() };
  } catch {
    return null;
  }
}

async function probeStatusPage(url: string | undefined): Promise<{ ok: boolean; status?: number; url?: string; error?: string } | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    return { ok: response.ok, status: response.status, url };
  } catch (error: any) {
    return { ok: false, url, error: String(error?.message ?? error) };
  } finally {
    clearTimeout(timeout);
  }
}

type ForecastSummary = {
  daily: Array<{
    date: string;
    maxTempF: number;
    minTempF: number;
    snowfallIn: number;
    precipIn: number;
    windMph: number;
  }>;
  sourceUrl: string;
};

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

