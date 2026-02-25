import { createOAuthClient } from "../adapters/integrations/googleAuth";
import { syncCalendarDraftEvents } from "../adapters/integrations/googleCalendar";
import { sendConversationMessages } from "../adapters/integrations/twilioConversations";
import { getConversationStore } from "../adapters/persistence";
import { getGoogleRefreshToken } from "../adapters/persistence/googleTokens";
import { loadConversationByTripId } from "../conversations/sessionService";
import { buildDecisionPackage } from "../core/decision";
import { attachWorkflowState } from "../core/tripWorkflow";
import { enrichDecisionPackageWithLLMReview } from "./decisionReviewService";

type LoadedTrip = NonNullable<Awaited<ReturnType<typeof loadConversationByTripId>>>;

export async function exportTripCalendarIcs(tripId: string): Promise<{ filename: string; ics: string; decisionPackage: any } | null> {
  const loaded = await ensureTripWithDecision(tripId);
  if (!loaded) return null;
  const events = loaded.conversation.decisionPackage!.workflow?.integrations?.calendarDraft?.events ?? [];
  const ics = buildIcs(events, {
    uidPrefix: loaded.conversation.id,
    prodId: "-//Apres AI//Trip Calendar//EN"
  });
  const decisionPackage = loaded.conversation.decisionPackage!;
  if (decisionPackage.workflow) {
    decisionPackage.workflow.integrations.calendarDraft.lastSyncedAt = new Date().toISOString();
    decisionPackage.workflow.integrations.calendarDraft.lastSyncSummary = `ICS exported (${events.length} events).`;
    decisionPackage.workflow.integrations.calendarDraft.syncProvider = "ics_export";
    decisionPackage.workflow.integrations.calendarDraft.syncedEventCount = events.length;
    decisionPackage.workflow.integrations.calendarDraft.icsUrl = `/api/trips/${encodeURIComponent(tripId)}/integrations/calendar.ics`;
  }
  await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
  return {
    filename: `apres-${slug(decisionPackage.resortShortlist?.[0] ?? "trip")}-calendar.ics`,
    ics,
    decisionPackage
  };
}

export async function syncTripCalendarToGoogle(
  tripId: string
): Promise<{ ok: boolean; mode: "live" | "simulated"; insertedCount: number; summary: string; decisionPackage: any } | null> {
  const loaded = await ensureTripWithDecision(tripId);
  if (!loaded) return null;
  const decisionPackage = loaded.conversation.decisionPackage!;
  const events = decisionPackage.workflow?.integrations?.calendarDraft?.events ?? [];
  if (events.length === 0) {
    return { ok: false, mode: "simulated", insertedCount: 0, summary: "No calendar events available.", decisionPackage };
  }

  let result: Awaited<ReturnType<typeof syncCalendarDraftEvents>>;
  try {
    const refreshToken = await getGoogleRefreshToken(loaded.session.id);
    if (!refreshToken) {
      result = { ok: true, mode: "simulated", calendarId: "primary", insertedCount: events.length, errors: ["Google not linked"] };
    } else {
      const client = createOAuthClient();
      client.setCredentials({ refresh_token: refreshToken });
      result = await syncCalendarDraftEvents(client, events);
      if (!result.ok && result.insertedCount === 0) {
        result = { ...result, mode: "simulated", insertedCount: events.length };
      }
    }
  } catch (error: any) {
    result = {
      ok: true,
      mode: "simulated",
      calendarId: "primary",
      insertedCount: events.length,
      errors: [String(error?.message ?? error)]
    };
  }

  if (decisionPackage.workflow) {
    decisionPackage.workflow.integrations.calendarDraft.lastSyncedAt = new Date().toISOString();
    decisionPackage.workflow.integrations.calendarDraft.syncProvider =
      result.mode === "live" ? "google_calendar" : "simulated";
    decisionPackage.workflow.integrations.calendarDraft.syncedEventCount = result.insertedCount;
    decisionPackage.workflow.integrations.calendarDraft.lastSyncSummary =
      result.mode === "live"
        ? `Google Calendar sync: ${result.insertedCount} event(s) inserted to ${result.calendarId}.`
        : `Simulated calendar sync prepared ${result.insertedCount} event(s).`;
  }
  await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
  return {
    ok: result.ok,
    mode: result.mode,
    insertedCount: result.insertedCount,
    summary: decisionPackage.workflow?.integrations.calendarDraft.lastSyncSummary ?? "Calendar sync updated.",
    decisionPackage
  };
}

export async function prepareSplitwiseExpensePlan(
  tripId: string
): Promise<{ decisionPackage: any; plannedExpenses: Array<any> } | null> {
  const loaded = await ensureTripWithDecision(tripId);
  if (!loaded) return null;
  const decisionPackage = loaded.conversation.decisionPackage!;
  const workflow = decisionPackage.workflow;
  if (!workflow) return { decisionPackage, plannedExpenses: [] };
  const bestTotal = Number(decisionPackage.budgetSummary.bestGroupTotal || 0);
  const defaults = workflow.integrations.splitwise.taskLinkedExpenseDefaults;
  const taskById = new Map(workflow.coordination.tasks.map((task) => [task.id, task]));
  const baselineMap: Record<string, number> = {
    "booking-deposit": 0.25,
    "car-rental": 0.18,
    "gear-rental": 0.1,
    "grocery-run": 0.12,
    "restaurant-booking": 0.08
  };
  const planned = defaults.map((entry) => {
    const task = taskById.get(entry.taskId);
    const fallbackShare = baselineMap[entry.taskId] ?? 0.05;
    const amountUsd = Math.max(1, Math.round(bestTotal * fallbackShare));
    return {
      description: task?.title ?? entry.taskId,
      amountUsd,
      category: entry.category,
      payerDefault: entry.defaultPayer,
      taskId: entry.taskId,
      dueDate: task?.dueDate ?? null,
      status: task?.status ?? "todo"
    };
  });
  workflow.integrations.splitwise.plannedExpenses = planned;
  workflow.integrations.splitwise.lastPlannedAt = new Date().toISOString();
  await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
  return { decisionPackage, plannedExpenses: planned };
}

export async function dispatchTripMessagingNudges(
  tripId: string,
  kinds: Array<"deadline" | "vote" | "link_refresh"> = ["deadline", "vote", "link_refresh"]
): Promise<{
  decisionPackage: any;
  sentCount: number;
  mode: "live" | "simulated";
  messages: string[];
  errors: string[];
} | null> {
  const loaded = await ensureTripWithDecision(tripId);
  if (!loaded) return null;
  const decisionPackage = loaded.conversation.decisionPackage!;
  const workflow = decisionPackage.workflow;
  if (!workflow) return null;

  const payloads: Array<{ author: string; body: string; type: "deadline" | "vote" | "link_refresh" }> = [];
  if (kinds.includes("deadline")) {
    for (const nudge of workflow.integrations.messaging.reminderNudges.slice(0, 4)) {
      payloads.push({ author: "apres-ai", body: nudge.message, type: "deadline" });
    }
  }
  if (kinds.includes("vote")) {
    for (const req of workflow.integrations.messaging.voteRequests.slice(0, 4)) {
      payloads.push({ author: "apres-ai", body: `Vote request: ${req.title}. Please submit your vote in Apres AI.`, type: "vote" });
    }
  }
  if (kinds.includes("link_refresh")) {
    for (const notice of workflow.integrations.messaging.linkRefreshNotices.slice(0, 4)) {
      payloads.push({ author: "apres-ai", body: notice.message, type: "link_refresh" });
    }
  }

  const sendResult = await sendConversationMessages(
    decisionPackage.opsBoard.chatBootstrap?.conversationSid ?? null,
    payloads.map((message) => ({ author: message.author, body: message.body }))
  );

  const sentAt = new Date().toISOString();
  const history = workflow.integrations.messaging.dispatchHistory ?? [];
  for (const payload of payloads) {
    history.push({
      id: `msg_${Math.random().toString(36).slice(2, 10)}`,
      channel: sendResult.mode === "live" ? "twilio" : "simulated",
      messageType: payload.type,
      status: sendResult.mode === "live" ? (sendResult.ok ? "sent" : "failed") : "simulated",
      summary: payload.body,
      sentAt
    });
  }
  workflow.integrations.messaging.dispatchHistory = history.slice(-25);
  workflow.integrations.messaging.lastDispatchAt = sentAt;
  await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });

  return {
    decisionPackage,
    sentCount: sendResult.sentCount,
    mode: sendResult.mode,
    messages: payloads.map((m) => m.body),
    errors: sendResult.errors
  };
}

async function ensureTripWithDecision(tripId: string): Promise<LoadedTrip | null> {
  const loaded = await loadConversationByTripId(tripId);
  if (!loaded) return null;
  if (!loaded.conversation.decisionPackage) {
    let decisionPackage = await enrichDecisionPackageWithLLMReview(loaded.conversation.tripSpec, await buildDecisionPackage(loaded.conversation.tripSpec));
    decisionPackage = attachWorkflowState(loaded.conversation.tripSpec, decisionPackage, {
      previousDecisionPackage: loaded.conversation.decisionPackage,
      trigger: "workflow_refresh"
    });
    await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage });
    loaded.conversation.decisionPackage = decisionPackage;
  } else {
    const refreshed = attachWorkflowState(loaded.conversation.tripSpec, loaded.conversation.decisionPackage, {
      previousDecisionPackage: loaded.conversation.decisionPackage,
      trigger: "workflow_refresh"
    });
    await getConversationStore().updateConversation(loaded.conversation.id, { decisionPackage: refreshed });
    loaded.conversation.decisionPackage = refreshed;
  }
  return loaded;
}

function buildIcs(
  events: Array<{ title: string; date: string; kind: string }>,
  options: { uidPrefix: string; prodId: string }
): string {
  const nowStamp = formatIcsDateTime(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `PRODID:${escapeIcs(options.prodId)}`
  ];
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const start = formatIcsDate(event.date);
    const end = formatIcsDate(incrementIsoDate(event.date, 1));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(`${options.uidPrefix}-${i}-${event.date}`)}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcs(`Apres ${event.kind === "travel" ? "Travel" : event.kind === "deadline" ? "Deadline" : "Trip"}: ${event.title}`)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function formatIcsDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function incrementIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function slug(input: string): string {
  return String(input).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

