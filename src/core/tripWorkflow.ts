import { createHash } from "node:crypto";
import dayjs from "dayjs";
import { llmModelName, llmProfile } from "../llm/config";
import type { DecisionPackage } from "./decision";
import type { Itinerary } from "./itinerary";
import type { OpsTask } from "./opsBoard";
import type { TripSpec } from "./tripSpec";

export type TripStage =
  | "intake"
  | "candidate_compare"
  | "decision_locking"
  | "booking_prep"
  | "execution"
  | "post_trip";

export type StageStatus = "todo" | "in_progress" | "blocked" | "done";
export type HealthStatus = "ok" | "watch" | "warning" | "unknown";

export type WorkflowStageState = {
  stage: TripStage;
  label: string;
  status: StageStatus;
  blockers: string[];
  criteria: string[];
};

export type WorkflowChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  blocker?: boolean;
  detail?: string;
};

export type WorkflowDecisionType =
  | "dates"
  | "resort"
  | "lodging"
  | "transport"
  | "budget_cap";

export type LockedDecision = {
  type: WorkflowDecisionType;
  value: string;
  locked: boolean;
  source: "tripspec" | "workflow";
  author: string;
  updatedAt: string;
};

export type DecisionLogEntry = {
  id: string;
  type: "lock" | "vote" | "approval" | "comment" | "task" | "recompute" | "stage";
  summary: string;
  author: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type AssumptionReviewItem = {
  id: string;
  label: string;
  summary: string;
  source: "pending_assumption" | "spec_assumption" | "missing_field" | "itinerary_assumption";
  status: "pending" | "accepted" | "dismissed";
  confidence?: number;
  path?: string;
  updatedAt: string;
};

export type ItinerarySourceFreshness = {
  overall: "fresh" | "aging" | "stale" | "unknown";
  overallLabel: string;
  maxAgeHours: number | null;
  lodging: "fresh" | "aging" | "stale" | "unknown";
  cars: "fresh" | "aging" | "stale" | "unknown";
  pois: "fresh" | "aging" | "stale" | "unknown";
  latestFetchedAt: string | null;
};

export type ItineraryAudit = {
  itineraryId: string;
  sourceFreshness: ItinerarySourceFreshness;
  assumptionTags: string[];
  confirmedTags: string[];
};

export type WorkflowComment = {
  id: string;
  targetType: "itinerary" | "task" | "decision";
  targetId: string;
  author: string;
  message: string;
  createdAt: string;
};

export type WorkflowVoteType =
  | "shortlist_vote"
  | "final_resort_vote"
  | "lodging_vote"
  | "budget_approval";

export type WorkflowVote = {
  type: WorkflowVoteType;
  title: string;
  options: string[];
  ballots: Array<{ voter: string; choice: string; rationale?: string; castAt: string }>;
  status: "open" | "approved" | "closed";
  winner?: string | null;
  updatedAt: string;
};

export type WorkflowTask = {
  id: string;
  title: string;
  category: "lodging" | "transport" | "rentals" | "groceries" | "dining" | "general";
  owner: string;
  dueDate: string | null;
  status: "todo" | "blocked" | "done";
  reminderDaysBefore: number;
  notes: string;
  critical: boolean;
};

export type WorkflowRole = {
  userId: string;
  displayName: string;
  role: "planner_admin" | "member" | "approver";
};

export type WorkflowCoordinationState = {
  roles: WorkflowRole[];
  comments: WorkflowComment[];
  votes: WorkflowVote[];
  tasks: WorkflowTask[];
};

export type WorkflowRunMetadata = {
  runId: string;
  createdAt: string;
  trigger: "chat_generation" | "recompute_same_snapshot" | "recompute_refreshed_live" | "workflow_refresh";
  llmProfile: string;
  llmModel: string;
  promptVersionMarkers: string[];
  scoringVersion: string;
  providerTimestamps: Record<string, string | null>;
  dataSnapshotDigest: string;
};

export type WorkflowRunDiff = {
  previousRunId: string;
  currentRunId: string;
  createdAt: string;
  lockedDecisionsPreserved: boolean;
  lockPreservationNotes: string[];
  costChanges: Array<{ itineraryId: string; resortName: string; previous: number | null; current: number | null; delta: number | null }>;
  lodgingAvailabilityChanges: Array<{ itineraryId: string; resortName: string; previousCount: number; currentCount: number }>;
  scoreRankChanges: Array<{ itineraryId: string; resortName: string; previousRank: number | null; currentRank: number | null; previousScore: number | null; currentScore: number | null }>;
  summary: string;
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  patch: Partial<TripSpec>;
};

export type LinkHealthRecord = {
  url: string;
  label: string;
  status: "ok" | "warning" | "broken" | "unknown";
  httpStatus?: number | null;
  error?: string | null;
  checkedAt: string;
};

export type WorkflowIntegrationsState = {
  calendarDraft: {
    lastGeneratedAt: string;
    events: Array<{ title: string; date: string; kind: "deadline" | "milestone" | "travel" }>;
  };
  splitwise: {
    taskLinkedExpenseDefaults: Array<{ taskId: string; category: string; defaultPayer: string }>;
    exportCategories: string[];
  };
  sheets: {
    stableColumns: string[];
    lastExportedAt?: string | null;
  };
  messaging: {
    reminderNudges: Array<{ id: string; kind: "deadline" | "vote" | "link_refresh"; message: string; targetDate?: string | null }>;
    voteRequests: Array<{ voteType: WorkflowVoteType; title: string; open: boolean }>;
    linkRefreshNotices: Array<{ label: string; message: string }>;
  };
  linkHealth: {
    lastCheckedAt: string | null;
    records: LinkHealthRecord[];
  };
};

export type WorkflowOperationalCheck = {
  key: "weather_snow" | "lift_ops" | "roads" | "airport_timing" | "trip_week_readiness";
  label: string;
  status: HealthStatus;
  summary: string;
  checkedAt: string;
};

export type WorkflowOperationalState = {
  checks: WorkflowOperationalCheck[];
  tripWeekReadinessScore: number;
};

export type TripWorkflowState = {
  version: number;
  currentStage: TripStage;
  stages: WorkflowStageState[];
  bookingReadiness: {
    ready: boolean;
    remainingCount: number;
    items: WorkflowChecklistItem[];
  };
  assumptions: {
    queue: AssumptionReviewItem[];
    counts: { pending: number; accepted: number; dismissed: number };
  };
  lockedDecisions: LockedDecision[];
  decisionLog: DecisionLogEntry[];
  itineraryAudit: ItineraryAudit[];
  coordination: WorkflowCoordinationState;
  repeatability: {
    templates: WorkflowTemplate[];
    supportedRecomputeModes: Array<"same_snapshot" | "refresh_live">;
    lastRecomputeMode: "same_snapshot" | "refresh_live";
    runs: WorkflowRunMetadata[];
    latestDiff: WorkflowRunDiff | null;
  };
  integrations: WorkflowIntegrationsState;
  operations: WorkflowOperationalState;
};

export type WorkflowAction =
  | { type: "role_upsert"; userId: string; displayName?: string; role: WorkflowRole["role"] }
  | { type: "comment_add"; targetType: WorkflowComment["targetType"]; targetId: string; author?: string; message: string }
  | { type: "vote_cast"; voteType: WorkflowVoteType; voter?: string; choice: string; rationale?: string }
  | { type: "vote_close"; voteType: WorkflowVoteType; winner?: string | null; author?: string }
  | { type: "task_patch"; taskId: string; owner?: string; dueDate?: string | null; status?: WorkflowTask["status"]; reminderDaysBefore?: number; notes?: string }
  | { type: "assumption_review"; itemId: string; status: AssumptionReviewItem["status"] }
  | { type: "decision_lock"; decisionType: WorkflowDecisionType; value: string; author?: string }
  | { type: "decision_unlock"; decisionType: WorkflowDecisionType; author?: string };

type AttachOptions = {
  previousDecisionPackage?: DecisionPackage | null;
  trigger?: WorkflowRunMetadata["trigger"];
  recomputeMode?: "same_snapshot" | "refresh_live";
  nowIso?: string;
};

const WORKFLOW_VERSION = 1;
const SCORING_VERSION = "decision-matrix-v2";
const PROMPT_MARKERS = ["spec-extraction:v1", "candidate-review:v1", SCORING_VERSION];

export function attachWorkflowState(
  spec: TripSpec,
  nextDecision: DecisionPackage,
  options: AttachOptions = {}
): DecisionPackage {
  const now = options.nowIso ?? new Date().toISOString();
  const previousDecision = options.previousDecisionPackage ?? null;
  const prevWorkflow = previousDecision?.workflow ?? null;

  const coordination = buildCoordinationState(nextDecision.opsBoard.tasks, prevWorkflow?.coordination, now);
  populateVoteOptions(coordination, nextDecision);
  nextDecision.opsBoard.tasks = coordination.tasks.map(toOpsTask);

  const itineraryAudit = buildItineraryAudit(spec, nextDecision, now);
  const assumptionsQueue = buildAssumptionQueue(spec, nextDecision, prevWorkflow, now);
  const lockedDecisions = buildLockedDecisions(spec, prevWorkflow?.lockedDecisions ?? [], now);
  const integrations = buildIntegrations(nextDecision, coordination, prevWorkflow?.integrations, now);
  const operations = buildOperationalState(spec, nextDecision, coordination, integrations, now);
  const stageInputs = buildStages(spec, nextDecision, lockedDecisions, assumptionsQueue, coordination, integrations, operations);
  const bookingReadiness = buildBookingReadiness(stageInputs, coordination, integrations);

  const previousRuns = prevWorkflow?.repeatability?.runs ?? [];
  const run = buildRunMetadata(spec, nextDecision, options.trigger ?? "workflow_refresh", now);
  const runs = [...previousRuns, run].slice(-12);
  const latestDiff = buildRunDiff(previousDecision, nextDecision, lockedDecisions, runs[runs.length - 2], run, now);

  const repeatability = {
    templates: defaultTemplates(),
    supportedRecomputeModes: ["same_snapshot", "refresh_live"] as Array<"same_snapshot" | "refresh_live">,
    lastRecomputeMode: options.recomputeMode ?? prevWorkflow?.repeatability?.lastRecomputeMode ?? "refresh_live",
    runs,
    latestDiff
  };

  const decisionLog = appendDecisionLog(prevWorkflow?.decisionLog ?? [], {
    previousWorkflow: prevWorkflow,
    stage: stageInputs.currentStage,
    lockedDecisions,
    trigger: options.trigger ?? "workflow_refresh",
    now
  });

  const workflow: TripWorkflowState = {
    version: WORKFLOW_VERSION,
    currentStage: stageInputs.currentStage,
    stages: stageInputs.stages,
    bookingReadiness,
    assumptions: assumptionsQueue,
    lockedDecisions,
    decisionLog,
    itineraryAudit,
    coordination,
    repeatability,
    integrations,
    operations
  };

  return { ...nextDecision, workflow };
}

export function applyWorkflowActions(
  spec: TripSpec,
  decision: DecisionPackage,
  actions: WorkflowAction[],
  nowIso?: string
): DecisionPackage {
  const now = nowIso ?? new Date().toISOString();
  const withWorkflow = attachWorkflowState(spec, decision, {
    previousDecisionPackage: decision,
    trigger: "workflow_refresh",
    nowIso: now
  });
  const workflow = structuredClone(withWorkflow.workflow ?? null) as TripWorkflowState | null;
  if (!workflow) return withWorkflow;

  for (const action of actions) {
    if (action.type === "role_upsert") {
      const existing = workflow.coordination.roles.find((role) => role.userId === action.userId);
      if (existing) {
        existing.role = action.role;
        if (action.displayName) existing.displayName = action.displayName;
      } else {
        workflow.coordination.roles.push({
          userId: action.userId,
          displayName: action.displayName ?? humanizeId(action.userId),
          role: action.role
        });
      }
    }
    if (action.type === "comment_add") {
      const message = action.message.trim();
      if (!message) continue;
      workflow.coordination.comments.push({
        id: `c_${shortId()}`,
        targetType: action.targetType,
        targetId: action.targetId,
        author: action.author ?? "Planner",
        message,
        createdAt: now
      });
      workflow.decisionLog = appendLog(workflow.decisionLog, {
        id: `log_${shortId()}`,
        type: "comment",
        summary: `Comment added on ${action.targetType.replace("_", " ")} ${action.targetId}.`,
        author: action.author ?? "Planner",
        timestamp: now
      });
    }
    if (action.type === "vote_cast") {
      const vote = ensureVote(workflow, action.voteType, withWorkflow);
      vote.ballots = vote.ballots.filter((b) => b.voter !== (action.voter ?? "Planner"));
      vote.ballots.push({
        voter: action.voter ?? "Planner",
        choice: action.choice,
        rationale: action.rationale?.trim() || undefined,
        castAt: now
      });
      vote.updatedAt = now;
      vote.winner = computeVoteWinner(vote);
      if (vote.type === "budget_approval" && vote.winner === "Approve") vote.status = "approved";
      workflow.decisionLog = appendLog(workflow.decisionLog, {
        id: `log_${shortId()}`,
        type: vote.type === "budget_approval" ? "approval" : "vote",
        summary: `${vote.title}: ${(action.voter ?? "Planner")} voted ${action.choice}.`,
        author: action.voter ?? "Planner",
        timestamp: now
      });
    }
    if (action.type === "vote_close") {
      const vote = ensureVote(workflow, action.voteType, withWorkflow);
      vote.status = vote.type === "budget_approval" && (action.winner ?? vote.winner) === "Approve" ? "approved" : "closed";
      vote.winner = action.winner ?? vote.winner ?? computeVoteWinner(vote);
      vote.updatedAt = now;
      workflow.decisionLog = appendLog(workflow.decisionLog, {
        id: `log_${shortId()}`,
        type: vote.type === "budget_approval" ? "approval" : "vote",
        summary: `${vote.title} closed${vote.winner ? ` with ${vote.winner}` : ""}.`,
        author: action.author ?? "Planner",
        timestamp: now
      });
    }
    if (action.type === "task_patch") {
      const task = workflow.coordination.tasks.find((item) => item.id === action.taskId);
      if (!task) continue;
      if (action.owner !== undefined) task.owner = action.owner;
      if (Object.prototype.hasOwnProperty.call(action, "dueDate")) task.dueDate = action.dueDate ?? null;
      if (action.status) task.status = action.status;
      if (typeof action.reminderDaysBefore === "number" && Number.isFinite(action.reminderDaysBefore)) {
        task.reminderDaysBefore = Math.max(0, Math.round(action.reminderDaysBefore));
      }
      if (action.notes !== undefined) task.notes = action.notes;
      workflow.decisionLog = appendLog(workflow.decisionLog, {
        id: `log_${shortId()}`,
        type: "task",
        summary: `Updated task "${task.title}".`,
        author: "Planner",
        timestamp: now
      });
    }
    if (action.type === "assumption_review") {
      const item = workflow.assumptions.queue.find((entry) => entry.id === action.itemId);
      if (!item) continue;
      item.status = action.status;
      item.updatedAt = now;
    }
    if (action.type === "decision_lock" || action.type === "decision_unlock") {
      const existing = workflow.lockedDecisions.find((d) => d.type === action.decisionType);
      const locked = action.type === "decision_lock";
      if (existing) {
        existing.locked = locked;
        if (locked) existing.value = action.value;
        existing.updatedAt = now;
        existing.author = action.author ?? "Planner";
      } else if (locked) {
        workflow.lockedDecisions.push({
          type: action.decisionType,
          value: action.value,
          locked: true,
          source: "workflow",
          author: action.author ?? "Planner",
          updatedAt: now
        });
      }
      workflow.decisionLog = appendLog(workflow.decisionLog, {
        id: `log_${shortId()}`,
        type: "lock",
        summary: `${locked ? "Locked" : "Unlocked"} ${action.decisionType.replace("_", " ")}${locked ? `: ${action.value}` : ""}.`,
        author: action.author ?? "Planner",
        timestamp: now
      });
    }
  }

  const rebuilt = attachWorkflowState(spec, { ...withWorkflow, workflow, opsBoard: { ...withWorkflow.opsBoard, tasks: workflow.coordination.tasks.map(toOpsTask) } }, {
    previousDecisionPackage: { ...withWorkflow, workflow },
    trigger: "workflow_refresh",
    nowIso: now,
    recomputeMode: workflow.repeatability.lastRecomputeMode
  });
  return rebuilt;
}

export function buildWorkflowSnapshotReport(
  spec: TripSpec,
  decision: DecisionPackage
): { json: Record<string, unknown>; markdown: string } {
  const workflow = decision.workflow;
  const latestRun = workflow?.repeatability.runs.at(-1) ?? null;
  const json = {
    exportedAt: new Date().toISOString(),
    tripSpec: {
      id: spec.id,
      dates: spec.dates,
      group: spec.group,
      budget: spec.budget,
      travel: spec.travel,
      location: spec.location,
      passes: spec.notes.passes ?? null,
      locks: spec.locks
    },
    workflow: workflow ?? null,
    decisionSummary: {
      resortShortlist: decision.resortShortlist,
      budgetSummary: decision.budgetSummary,
      decisionMatrix: decision.decisionMatrix.map((row) => ({
        itineraryId: row.itineraryId,
        resortName: row.resortName,
        totalCostPerPerson: row.totalCostPerPerson,
        overallScore: row.overallScore,
        locked: row.locked
      })),
      itineraries: decision.itineraries.map((it) => ({
        id: it.id,
        resortName: it.resortName,
        dateRange: it.dateRange,
        budgetEstimate: it.budgetEstimate,
        aiReview: it.aiReview ?? null
      }))
    },
    latestRun
  };

  const md = [
    `# Trip Snapshot Report`,
    ``,
    `- Exported: ${json.exportedAt}`,
    `- Trip ID: ${spec.id}`,
    `- Current stage: ${workflow?.currentStage ?? "unknown"}`,
    `- Booking ready: ${workflow?.bookingReadiness.ready ? "Yes" : "No"}`,
    `- LLM profile/model: ${latestRun ? `${latestRun.llmProfile} / ${latestRun.llmModel}` : "unknown"}`,
    ``,
    `## Locked Decisions`,
    ...(workflow?.lockedDecisions.length
      ? workflow.lockedDecisions.map((d) => `- ${d.type}: ${d.locked ? d.value : "unlocked"} (${d.source})`)
      : ["- None"]),
    ``,
    `## Decision Matrix`,
    ...(decision.decisionMatrix.map(
      (row, index) =>
        `- ${index + 1}. ${row.resortName} | score ${pct(row.overallScore)} | cost ${row.totalCostPerPerson ?? "n/a"}${row.locked ? " | locked" : ""}`
    ) || ["- None"]),
    ``,
    `## Recent Diff`,
    workflow?.repeatability.latestDiff
      ? `- ${workflow.repeatability.latestDiff.summary}`
      : `- No previous run diff available.`,
    ``,
    `## Open Coordination Tasks`,
    ...(workflow?.coordination.tasks
      .filter((t) => t.status !== "done")
      .map((t) => `- ${t.title} | owner ${t.owner} | due ${t.dueDate ?? "TBD"} | ${t.status}`) ?? ["- None"])
  ].join("\n");

  return { json, markdown: md };
}

export async function runWorkflowLinkHealthValidation(
  decision: DecisionPackage,
  timeoutMs: number = 3000
): Promise<DecisionPackage> {
  const workflow = decision.workflow;
  const urls = collectLinkTargets(decision).slice(0, 10);
  const checkedAt = new Date().toISOString();
  const records = await Promise.all(urls.map((target) => probeLink(target.url, target.label, checkedAt, timeoutMs)));
  const nextWorkflow = workflow
    ? {
        ...workflow,
        integrations: {
          ...workflow.integrations,
          linkHealth: {
            lastCheckedAt: checkedAt,
            records
          }
        }
      }
    : undefined;
  return nextWorkflow ? { ...decision, workflow: nextWorkflow } : decision;
}

function buildCoordinationState(tasks: OpsTask[], prev: TripWorkflowState["coordination"] | undefined, now: string): WorkflowCoordinationState {
  const prevTaskById = new Map((prev?.tasks ?? []).map((task) => [task.id, task]));
  const normalizedTasks: WorkflowTask[] = tasks.map((task) => {
    const prevTask = prevTaskById.get(task.id);
    return {
      id: task.id,
      title: task.title,
      category: inferTaskCategory(task),
      owner: prevTask?.owner ?? task.owner,
      dueDate: prevTask?.dueDate ?? task.dueDate,
      status: prevTask?.status ?? task.status,
      reminderDaysBefore: prevTask?.reminderDaysBefore ?? 2,
      notes: prevTask?.notes ?? task.notes,
      critical: /lodging|car|travel|rental|grocery|restaurant/i.test(task.id + task.title)
    };
  });

  return {
    roles: prev?.roles?.length
      ? prev.roles
      : [
          { userId: "planner", displayName: "Planner", role: "planner_admin" },
          { userId: "member_1", displayName: "Member 1", role: "member" },
          { userId: "approver", displayName: "Approver", role: "approver" }
        ],
    comments: (prev?.comments ?? []).slice(-80),
    votes: seedVotes(prev?.votes ?? [], normalizedTasks, now),
    tasks: normalizedTasks
  };
}

function seedVotes(prevVotes: WorkflowVote[], tasks: WorkflowTask[], now: string): WorkflowVote[] {
  const seeded: WorkflowVote[] = [
    { type: "shortlist_vote", title: "Shortlist vote", options: [], ballots: [], status: "open", updatedAt: now },
    { type: "final_resort_vote", title: "Final resort vote", options: [], ballots: [], status: "open", updatedAt: now },
    { type: "lodging_vote", title: "Lodging vote", options: [], ballots: [], status: "open", updatedAt: now },
    { type: "budget_approval", title: "Budget approval", options: ["Approve", "Revise"], ballots: [], status: "open", updatedAt: now }
  ];
  const byType = new Map(prevVotes.map((vote) => [vote.type, vote]));
  return seeded.map((base) => {
    const prev = byType.get(base.type);
    return prev ? { ...base, ...prev, options: prev.options.length ? prev.options : base.options } : base;
  });
}

function populateVoteOptions(coordination: WorkflowCoordinationState, decision: DecisionPackage): void {
  const resortOptions = decision.itineraries.map((it) => it.resortName);
  const lodgingOptions = decision.itineraries
    .map((it) => `${it.resortName}: ${it.liveOptions?.lodging?.[0]?.name ?? "Top lodging TBD"}`);
  for (const vote of coordination.votes) {
    if (vote.type === "budget_approval") {
      if (!vote.options.length) vote.options = ["Approve", "Revise"];
      continue;
    }
    if (vote.type === "lodging_vote") {
      if (!vote.options.length) vote.options = lodgingOptions;
      continue;
    }
    if (!vote.options.length) vote.options = resortOptions;
  }
}

function buildItineraryAudit(spec: TripSpec, decision: DecisionPackage, now: string): ItineraryAudit[] {
  const poiFreshness = deriveFreshnessFromDates([
    ...decision.poiResults.gearShops.map((p) => p.sourceMeta?.fetchedAt ?? null),
    ...decision.poiResults.groceries.map((p) => p.sourceMeta?.fetchedAt ?? null),
    ...decision.poiResults.restaurants.map((p) => p.sourceMeta?.fetchedAt ?? null)
  ], now);
  const specAssumptionCount = (spec.extraction.assumptions ?? []).length + (spec.extraction.pendingAssumptions ?? []).length;
  const unresolvedCount = (spec.status.missingFields ?? []).length;

  return decision.itineraries.map((itinerary) => {
    const lodgingDates = (itinerary.liveOptions?.lodging ?? []).slice(0, 3).map((o) => o.sourceMeta?.fetchedAt ?? null);
    const carDates = (itinerary.liveOptions?.cars ?? []).slice(0, 3).map((o) => o.sourceMeta?.fetchedAt ?? null);
    const lodgingFresh = deriveFreshnessFromDates(lodgingDates, now);
    const carFresh = deriveFreshnessFromDates(carDates, now);
    const overall = mergeFreshness([lodgingFresh.state, carFresh.state, poiFreshness.state]);
    const maxAgeHours = maxNumber([lodgingFresh.maxAgeHours, carFresh.maxAgeHours, poiFreshness.maxAgeHours]);
    const assumptionTags = [
      ...(itinerary.budgetEstimate.assumptions.length ? [`Budget assumptions (${itinerary.budgetEstimate.assumptions.length})`] : []),
      ...(specAssumptionCount ? [`Spec assumptions (${specAssumptionCount})`] : []),
      ...(unresolvedCount ? [`Unresolved inputs (${unresolvedCount})`] : [])
    ].slice(0, 4);
    const confirmedTags = [
      ...(spec.locks.lockedResortName && spec.locks.lockedResortName.toLowerCase() === itinerary.resortName.toLowerCase() ? ["Resort locked"] : []),
      ...(spec.budget.confirmed ? ["Budget confirmed"] : []),
      ...(spec.notes.passes?.confirmed ? ["Pass counts confirmed"] : [])
    ];
    return {
      itineraryId: itinerary.id,
      sourceFreshness: {
        overall,
        overallLabel: freshnessLabel(overall, maxAgeHours),
        maxAgeHours,
        lodging: lodgingFresh.state,
        cars: carFresh.state,
        pois: poiFreshness.state,
        latestFetchedAt: firstNonNull([lodgingFresh.latestFetchedAt, carFresh.latestFetchedAt, poiFreshness.latestFetchedAt])
      },
      assumptionTags,
      confirmedTags
    };
  });
}

function buildAssumptionQueue(
  spec: TripSpec,
  decision: DecisionPackage,
  prevWorkflow: TripWorkflowState | null,
  now: string
): TripWorkflowState["assumptions"] {
  const prev = new Map((prevWorkflow?.assumptions.queue ?? []).map((item) => [item.id, item]));
  const next: AssumptionReviewItem[] = [];

  for (const pending of spec.extraction.pendingAssumptions ?? []) {
    const id = `pending:${pending.id}`;
    next.push({
      id,
      label: pending.label,
      summary: pending.assumption,
      source: "pending_assumption",
      status: prev.get(id)?.status ?? "pending",
      path: pending.field,
      updatedAt: prev.get(id)?.updatedAt ?? pending.createdAt
    });
  }
  for (const assumption of spec.extraction.assumptions ?? []) {
    const id = `spec:${assumption.path}:${assumption.rationale}`;
    next.push({
      id,
      label: humanizePath(assumption.path),
      summary: assumption.rationale,
      source: "spec_assumption",
      status: prev.get(id)?.status ?? "pending",
      confidence: assumption.confidence,
      path: assumption.path,
      updatedAt: prev.get(id)?.updatedAt ?? assumption.createdAt
    });
  }
  for (const missing of spec.status.missingFields ?? []) {
    const id = `missing:${missing}`;
    next.push({
      id,
      label: humanizeId(missing),
      summary: "Still missing input required for reliable booking-ready planning.",
      source: "missing_field",
      status: prev.get(id)?.status ?? "pending",
      path: missing,
      updatedAt: prev.get(id)?.updatedAt ?? now
    });
  }
  for (const itinerary of decision.itineraries) {
    for (const assumption of itinerary.budgetEstimate.assumptions.slice(0, 2)) {
      const id = `itinerary:${itinerary.id}:${assumption}`;
      next.push({
        id,
        label: itinerary.resortName,
        summary: assumption,
        source: "itinerary_assumption",
        status: prev.get(id)?.status ?? "pending",
        updatedAt: prev.get(id)?.updatedAt ?? now
      });
    }
  }

  const deduped = dedupeBy(next, (item) => item.id).slice(0, 40);
  const counts = deduped.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { pending: 0, accepted: 0, dismissed: 0 } as Record<AssumptionReviewItem["status"], number>
  );
  return { queue: deduped, counts };
}

function buildLockedDecisions(spec: TripSpec, previous: LockedDecision[], now: string): LockedDecision[] {
  const prevByType = new Map(previous.map((item) => [item.type, item]));
  const derived: LockedDecision[] = [];
  const push = (type: WorkflowDecisionType, value: string | undefined, source: LockedDecision["source"]) => {
    if (!value) return;
    const prev = prevByType.get(type);
    derived.push({
      type,
      value,
      locked: true,
      source,
      author: prev?.author ?? "Planner",
      updatedAt: prev?.value === value ? prev.updatedAt : now
    });
  };
  if (spec.locks.lockedStartDate && spec.locks.lockedEndDate) {
    push("dates", `${spec.locks.lockedStartDate} to ${spec.locks.lockedEndDate}`, "tripspec");
  }
  push("resort", spec.locks.lockedResortName, "tripspec");
  for (const prior of previous) {
    if (derived.some((item) => item.type === prior.type)) continue;
    if (prior.locked) derived.push(prior);
  }
  return derived.sort((a, b) => a.type.localeCompare(b.type));
}

function buildStages(
  spec: TripSpec,
  decision: DecisionPackage,
  lockedDecisions: LockedDecision[],
  assumptions: TripWorkflowState["assumptions"],
  coordination: WorkflowCoordinationState,
  integrations: WorkflowIntegrationsState,
  operations: WorkflowOperationalState
): { stages: WorkflowStageState[]; currentStage: TripStage } {
  const hasCandidates = (decision.itineraries?.length ?? 0) >= 2;
  const hasResortLock = lockedDecisions.some((d) => d.type === "resort" && d.locked);
  const hasDateLock = lockedDecisions.some((d) => d.type === "dates" && d.locked);
  const budgetApproved = coordination.votes.find((v) => v.type === "budget_approval")?.status === "approved";
  const criticalTasks = coordination.tasks.filter((t) => t.critical);
  const criticalAssigned = criticalTasks.every((t) => Boolean(t.owner?.trim()));
  const criticalDated = criticalTasks.every((t) => Boolean(t.dueDate));
  const tripStart = spec.dates.start ? dayjs(spec.dates.start) : null;
  const tripEnd = spec.dates.end ? dayjs(spec.dates.end) : null;
  const now = dayjs();
  const inTrip = Boolean(tripStart && tripEnd && (now.isAfter(tripStart.subtract(1, "day")) && now.isBefore(tripEnd.add(1, "day"))));
  const postTrip = Boolean(tripEnd && now.isAfter(tripEnd.add(1, "day")));

  const stages: WorkflowStageState[] = [
    {
      stage: "intake",
      label: "Intake",
      status: spec.status.readyToGenerate ? "done" : spec.status.missingFields.length ? "in_progress" : "todo",
      blockers: spec.status.missingFields.slice(0, 5).map(humanizeId),
      criteria: ["Trip dates", "Group size/skill", "Budget", "Travel constraints", "Pass ownership"]
    },
    {
      stage: "candidate_compare",
      label: "Candidate Compare",
      status: !hasCandidates ? "blocked" : "done",
      blockers: hasCandidates ? [] : ["Generate at least 2 itinerary candidates"],
      criteria: ["2+ candidates", "Transparent decision matrix", "Source freshness tags", "Assumption review queue"]
    },
    {
      stage: "decision_locking",
      label: "Decision Locking",
      status: hasResortLock && hasDateLock && budgetApproved ? "done" : hasCandidates ? "in_progress" : "todo",
      blockers: [
        ...(hasResortLock ? [] : ["Lock resort"]),
        ...(hasDateLock ? [] : ["Lock dates"]),
        ...(budgetApproved ? [] : ["Approve budget"])
      ],
      criteria: ["Lock dates", "Lock resort", "Budget approval", "Decision rationale history"]
    },
    {
      stage: "booking_prep",
      label: "Booking Prep",
      status: criticalAssigned && criticalDated ? "done" : hasResortLock ? "in_progress" : "todo",
      blockers: [
        ...(criticalAssigned ? [] : ["Assign critical booking tasks"]),
        ...(criticalDated ? [] : ["Add due dates to critical tasks"]),
        ...(assumptions.counts.pending === 0 ? [] : ["Review remaining assumptions"])
      ],
      criteria: ["Task owners set", "Task deadlines set", "Assumptions reviewed", "Links checked"]
    },
    {
      stage: "execution",
      label: "Execution",
      status: postTrip ? "done" : inTrip ? "in_progress" : "todo",
      blockers: inTrip ? [] : ["Trip has not started"],
      criteria: ["Operational checks refreshed", "Travel timing reviewed", "Readiness checklist tracked"]
    },
    {
      stage: "post_trip",
      label: "Post Trip",
      status: postTrip ? "in_progress" : "todo",
      blockers: postTrip ? [] : ["Trip not finished yet"],
      criteria: ["Close out expenses", "Retrospective notes", "Archive final snapshot"]
    }
  ];

  const linkWarnings = integrations.linkHealth.records.filter((r) => r.status === "broken").length;
  if (linkWarnings > 0) {
    const booking = stages.find((stage) => stage.stage === "booking_prep");
    if (booking) booking.blockers.push(`${linkWarnings} broken planning links`);
  }
  const opsWarnings = operations.checks.filter((check) => check.status === "warning").length;
  if (opsWarnings > 0) {
    const exec = stages.find((stage) => stage.stage === "execution");
    if (exec) exec.blockers.push(`${opsWarnings} operational warnings`);
  }

  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i];
    const priorDone = i === 0 ? true : stages.slice(0, i).every((s) => s.status === "done");
    if (!priorDone && stage.status !== "todo") {
      stage.status = "todo";
    }
    if (stage.status !== "done" && stage.blockers.length > 0 && priorDone) {
      stage.status = i === 0 ? stage.status : "blocked";
    }
    if (priorDone && stage.status === "todo") {
      stage.status = "in_progress";
    }
  }

  const currentStage = stages.find((stage) => stage.status === "in_progress" || stage.status === "blocked")?.stage ?? "post_trip";
  return { stages, currentStage };
}

function buildBookingReadiness(
  stages: { stages: WorkflowStageState[]; currentStage: TripStage },
  coordination: WorkflowCoordinationState,
  integrations: WorkflowIntegrationsState
): TripWorkflowState["bookingReadiness"] {
  const budgetApproval = coordination.votes.find((v) => v.type === "budget_approval");
  const critical = coordination.tasks.filter((t) => t.critical);
  const brokenLinks = integrations.linkHealth.records.filter((record) => record.status === "broken").length;
  const items: WorkflowChecklistItem[] = [
    {
      id: "decision_locking",
      label: "Decision locking stage complete",
      done: stages.stages.find((s) => s.stage === "decision_locking")?.status === "done"
    },
    {
      id: "budget_approval",
      label: "Budget approved",
      done: budgetApproval?.status === "approved",
      blocker: true
    },
    {
      id: "task_owners",
      label: "Critical tasks assigned",
      done: critical.every((task) => Boolean(task.owner?.trim()))
    },
    {
      id: "task_due_dates",
      label: "Critical tasks have due dates",
      done: critical.every((task) => Boolean(task.dueDate))
    },
    {
      id: "link_health",
      label: "No broken planning links",
      done: brokenLinks === 0,
      detail: brokenLinks ? `${brokenLinks} broken` : "All checked links OK/unknown"
    }
  ];
  const remainingCount = items.filter((item) => !item.done).length;
  return { ready: remainingCount === 0, remainingCount, items };
}

function buildIntegrations(
  decision: DecisionPackage,
  coordination: WorkflowCoordinationState,
  previous: TripWorkflowState["integrations"] | undefined,
  now: string
): WorkflowIntegrationsState {
  const calendarEvents = buildCalendarDraft(coordination.tasks, decision);
  const records = previous?.linkHealth?.records?.length ? previous.linkHealth.records : seedLinkHealth(decision, now);
  const brokenOrStale = records.filter((r) => r.status === "broken" || r.status === "warning");
  const openVotes = coordination.votes.filter((v) => v.status === "open");
  const reminderNudges = coordination.tasks
    .filter((task) => task.status !== "done")
    .filter((task) => task.dueDate)
    .slice(0, 6)
    .map((task) => ({
      id: `deadline:${task.id}`,
      kind: "deadline" as const,
      message: `Reminder: ${task.title} is due ${task.dueDate} (owner: ${task.owner}).`,
      targetDate: task.dueDate
    }));
  const linkRefreshNotices = brokenOrStale.slice(0, 6).map((record) => ({
    label: record.label,
    message: record.status === "broken" ? `Broken link detected for ${record.label}.` : `Link may be stale for ${record.label}.`
  }));
  return {
    calendarDraft: {
      lastGeneratedAt: now,
      events: calendarEvents
    },
    splitwise: {
      taskLinkedExpenseDefaults: coordination.tasks.map((task) => ({
        taskId: task.id,
        category: taskExpenseCategory(task),
        defaultPayer: task.owner || "Organizer"
      })),
      exportCategories: ["Lodging", "Lift", "Travel", "Food", "Gear", "Ground Transport"]
    },
    sheets: {
      stableColumns: ["workflow_stage", "assignee", "confirmation_status", "source_freshness", "decision_locked", "due_date"],
      lastExportedAt: previous?.sheets?.lastExportedAt ?? null
    },
    messaging: {
      reminderNudges,
      voteRequests: openVotes.map((vote) => ({ voteType: vote.type, title: vote.title, open: true })),
      linkRefreshNotices
    },
    linkHealth: {
      lastCheckedAt: previous?.linkHealth?.lastCheckedAt ?? null,
      records
    }
  };
}

function buildOperationalState(
  spec: TripSpec,
  decision: DecisionPackage,
  coordination: WorkflowCoordinationState,
  integrations: WorkflowIntegrationsState,
  now: string
): WorkflowOperationalState {
  const start = spec.dates.start ? dayjs(spec.dates.start) : null;
  const daysUntilStart = start ? start.startOf("day").diff(dayjs().startOf("day"), "day") : null;
  const itineraryWarnings = decision.itineraries.flatMap((it) => it.warnings).map((w) => w.toLowerCase());
  const linkBrokenCount = integrations.linkHealth.records.filter((r) => r.status === "broken").length;
  const overdueTasks = coordination.tasks.filter((task) => task.dueDate && task.status !== "done" && dayjs(task.dueDate).isBefore(dayjs(), "day")).length;
  const missingAirport = !spec.travel.noFlying && !spec.travel.arrivalAirport;

  const checks: WorkflowOperationalCheck[] = [
    {
      key: "weather_snow",
      label: "Weather / Snow",
      status:
        itineraryWarnings.some((w) => w.includes("snow") || w.includes("temperature"))
          ? "watch"
          : daysUntilStart !== null && daysUntilStart <= 7
            ? "watch"
            : "unknown",
      summary:
        daysUntilStart !== null && daysUntilStart <= 7
          ? "Trip is within 7 days. Refresh forecast/snow conditions before final packing."
          : "Operational forecast refresh not yet run. Historical snow signals available in itinerary cards.",
      checkedAt: now
    },
    {
      key: "lift_ops",
      label: "Lift Operations",
      status: daysUntilStart !== null && daysUntilStart <= 3 ? "watch" : "unknown",
      summary:
        daysUntilStart !== null && daysUntilStart <= 3
          ? "Trip is imminent. Check resort lift/status feed for wind holds and terrain openings."
          : "Lift status feed not configured; add a manual check 24-48h before departure.",
      checkedAt: now
    },
    {
      key: "roads",
      label: "Road Conditions / Chains",
      status: spec.travel.noFlying ? (daysUntilStart !== null && daysUntilStart <= 5 ? "watch" : "unknown") : "unknown",
      summary: spec.travel.noFlying
        ? "Driving trip. Review chain requirements and weather impacts on approach roads."
        : "Road chain checks apply to mountain transfer legs (airport/car).",
      checkedAt: now
    },
    {
      key: "airport_timing",
      label: "Airport Arrival + Car Pickup",
      status: missingAirport ? "warning" : !spec.travel.noFlying && daysUntilStart !== null && daysUntilStart <= 7 ? "watch" : "unknown",
      summary: missingAirport
        ? "Flying is allowed but arrival airport is not locked. Finalize airport for car timing checks."
        : !spec.travel.noFlying
          ? "Confirm arrival windows, baggage/gear timing, and rental car pickup buffer."
          : "Driving-only trip; airport timing not applicable.",
      checkedAt: now
    }
  ];

  const readinessFactors = [
    integrations.linkHealth.records.length > 0 && linkBrokenCount === 0 ? 1 : 0.5,
    overdueTasks === 0 ? 1 : Math.max(0, 1 - overdueTasks * 0.2),
    coordination.tasks.filter((t) => t.status === "done").length / Math.max(1, coordination.tasks.length),
    checks.filter((c) => c.status === "warning").length === 0 ? 1 : 0.4
  ];
  const readinessScore = Math.round((readinessFactors.reduce((sum, v) => sum + v, 0) / readinessFactors.length) * 100);

  checks.push({
    key: "trip_week_readiness",
    label: "Trip Week Readiness",
    status: readinessScore >= 80 ? "ok" : readinessScore >= 55 ? "watch" : "warning",
    summary: `${readinessScore}% readiness based on task completion, deadlines, link health, and operational warning count.`,
    checkedAt: now
  });

  return { checks, tripWeekReadinessScore: readinessScore };
}

function buildRunMetadata(
  _spec: TripSpec,
  decision: DecisionPackage,
  trigger: WorkflowRunMetadata["trigger"],
  now: string
): WorkflowRunMetadata {
  return {
    runId: `run_${shortId()}`,
    createdAt: now,
    trigger,
    llmProfile,
    llmModel: llmModelName,
    promptVersionMarkers: PROMPT_MARKERS,
    scoringVersion: SCORING_VERSION,
    providerTimestamps: {
      lodging: latestTimestamp(decision.itineraries.flatMap((it) => (it.liveOptions?.lodging ?? []).map((o) => o.sourceMeta?.fetchedAt ?? null))),
      cars: latestTimestamp(decision.itineraries.flatMap((it) => (it.liveOptions?.cars ?? []).map((o) => o.sourceMeta?.fetchedAt ?? null))),
      pois: latestTimestamp([
        ...decision.poiResults.gearShops.map((p) => p.sourceMeta?.fetchedAt ?? null),
        ...decision.poiResults.groceries.map((p) => p.sourceMeta?.fetchedAt ?? null),
        ...decision.poiResults.restaurants.map((p) => p.sourceMeta?.fetchedAt ?? null)
      ])
    },
    dataSnapshotDigest: digestDecisionSnapshot(decision)
  };
}

function buildRunDiff(
  previousDecision: DecisionPackage | null,
  currentDecision: DecisionPackage,
  lockedDecisions: LockedDecision[],
  previousRun: WorkflowRunMetadata | undefined,
  currentRun: WorkflowRunMetadata,
  now: string
): WorkflowRunDiff | null {
  if (!previousDecision || !previousRun) return null;
  const prevRankById = new Map(previousDecision.decisionMatrix.map((row, index) => [row.itineraryId, { rank: index + 1, score: row.overallScore }]));
  const prevCostById = new Map(previousDecision.decisionMatrix.map((row) => [row.itineraryId, row.totalCostPerPerson ?? null]));
  const prevLodgingCountById = new Map(previousDecision.itineraries.map((it) => [it.id, it.liveOptions?.lodging?.length ?? 0]));
  const currentRankById = new Map(currentDecision.decisionMatrix.map((row, index) => [row.itineraryId, { rank: index + 1, score: row.overallScore }]));

  const costChanges = currentDecision.itineraries.map((itinerary) => {
    const previous = prevCostById.get(itinerary.id) ?? null;
    const current = currentDecision.decisionMatrix.find((row) => row.itineraryId === itinerary.id)?.totalCostPerPerson ?? null;
    return {
      itineraryId: itinerary.id,
      resortName: itinerary.resortName,
      previous,
      current,
      delta: typeof previous === "number" && typeof current === "number" ? current - previous : null
    };
  });
  const lodgingAvailabilityChanges = currentDecision.itineraries.map((itinerary) => ({
    itineraryId: itinerary.id,
    resortName: itinerary.resortName,
    previousCount: prevLodgingCountById.get(itinerary.id) ?? 0,
    currentCount: itinerary.liveOptions?.lodging?.length ?? 0
  }));
  const scoreRankChanges = currentDecision.decisionMatrix.map((row) => ({
    itineraryId: row.itineraryId,
    resortName: row.resortName,
    previousRank: prevRankById.get(row.itineraryId)?.rank ?? null,
    currentRank: currentRankById.get(row.itineraryId)?.rank ?? null,
    previousScore: prevRankById.get(row.itineraryId)?.score ?? null,
    currentScore: row.overallScore
  }));

  const lockNotes: string[] = [];
  const lockedResort = lockedDecisions.find((d) => d.type === "resort" && d.locked)?.value;
  if (lockedResort) {
    const stillPresent = currentDecision.itineraries.some((it) => it.resortName.toLowerCase() === lockedResort.toLowerCase());
    lockNotes.push(stillPresent ? `Locked resort "${lockedResort}" preserved in candidate set.` : `Locked resort "${lockedResort}" not present after recompute.`);
  }
  const lockedDates = lockedDecisions.find((d) => d.type === "dates" && d.locked)?.value;
  if (lockedDates) {
    const datePreserved = currentDecision.itineraries.some((it) => `${it.dateRange?.start} to ${it.dateRange?.end}` === lockedDates);
    lockNotes.push(datePreserved ? `Locked dates ${lockedDates} preserved.` : `Locked dates ${lockedDates} changed/not represented.`);
  }
  if (lockNotes.length === 0) lockNotes.push("No workflow/tripSpec locks were set before recompute.");
  const lockedDecisionsPreserved = !lockNotes.some((note) => note.includes("not present") || note.includes("changed"));
  const changedCosts = costChanges.filter((change) => change.delta !== null && change.delta !== 0).length;
  const changedRanks = scoreRankChanges.filter((change) => change.previousRank !== null && change.currentRank !== change.previousRank).length;
  const summary = `Compared ${previousRun.runId} -> ${currentRun.runId}: ${changedCosts} cost deltas, ${changedRanks} rank changes, locks ${lockedDecisionsPreserved ? "preserved" : "need review"}.`;

  return {
    previousRunId: previousRun.runId,
    currentRunId: currentRun.runId,
    createdAt: now,
    lockedDecisionsPreserved,
    lockPreservationNotes: lockNotes,
    costChanges,
    lodgingAvailabilityChanges,
    scoreRankChanges,
    summary
  };
}

function appendDecisionLog(
  previous: DecisionLogEntry[],
  input: {
    previousWorkflow: TripWorkflowState | null;
    stage: TripStage;
    lockedDecisions: LockedDecision[];
    trigger: WorkflowRunMetadata["trigger"];
    now: string;
  }
): DecisionLogEntry[] {
  let log = [...previous];
  const prevStage = input.previousWorkflow?.currentStage;
  if (prevStage !== input.stage) {
    log = appendLog(log, {
      id: `log_${shortId()}`,
      type: "stage",
      summary: `Workflow stage is now ${input.stage.replace(/_/g, " ")}.`,
      author: "System",
      timestamp: input.now
    });
  }
  const prevLocks = new Map((input.previousWorkflow?.lockedDecisions ?? []).map((item) => [item.type, item]));
  for (const lock of input.lockedDecisions) {
    const prev = prevLocks.get(lock.type);
    if (!prev || prev.value !== lock.value || prev.locked !== lock.locked) {
      log = appendLog(log, {
        id: `log_${shortId()}`,
        type: "lock",
        summary: `Locked ${lock.type.replace(/_/g, " ")}: ${lock.value}.`,
        author: lock.author,
        timestamp: lock.updatedAt
      });
    }
  }
  if (input.trigger !== "workflow_refresh") {
    log = appendLog(log, {
      id: `log_${shortId()}`,
      type: "recompute",
      summary:
        input.trigger === "chat_generation"
          ? "Generated itinerary candidates."
          : input.trigger === "recompute_same_snapshot"
            ? "Recomputed workflow with same data snapshot."
            : "Recomputed with refreshed live data.",
      author: "System",
      timestamp: input.now
    });
  }
  return log.slice(-80);
}

function appendLog(log: DecisionLogEntry[], entry: DecisionLogEntry): DecisionLogEntry[] {
  const last = log.at(-1);
  if (last && last.type === entry.type && last.summary === entry.summary && last.author === entry.author) return log;
  return [...log, entry];
}

function buildCalendarDraft(tasks: WorkflowTask[], decision: DecisionPackage) {
  const events: Array<{ title: string; date: string; kind: "deadline" | "milestone" | "travel" }> = [];
  const sampleItinerary = decision.itineraries[0];
  if (sampleItinerary?.dateRange?.start) {
    events.push({ title: "Trip departure / travel start", date: sampleItinerary.dateRange.start, kind: "travel" });
  }
  if (sampleItinerary?.dateRange?.end) {
    events.push({ title: "Trip return / checkout", date: sampleItinerary.dateRange.end, kind: "travel" });
  }
  for (const task of tasks) {
    if (!task.dueDate) continue;
    events.push({ title: task.title, date: task.dueDate, kind: "deadline" });
  }
  return dedupeBy(events, (event) => `${event.date}:${event.title}`).slice(0, 20);
}

function seedLinkHealth(decision: DecisionPackage, now: string): LinkHealthRecord[] {
  return collectLinkTargets(decision)
    .slice(0, 40)
    .map((target) => ({
      url: target.url,
      label: target.label,
      status: isLikelyUrl(target.url) ? "unknown" : "broken",
      error: isLikelyUrl(target.url) ? null : "Malformed URL",
      checkedAt: now
    }));
}

function collectLinkTargets(decision: DecisionPackage): Array<{ label: string; url: string }> {
  const targets: Array<{ label: string; url: string }> = [];
  for (const itinerary of decision.itineraries) {
    const baseLabel = itinerary.resortName;
    const links = itinerary.researchLinks;
    for (const [key, value] of Object.entries(links ?? {})) {
      if (typeof value === "string" && value.trim()) {
        targets.push({ label: `${baseLabel} ${key}`, url: value });
      }
    }
    for (const lodging of (itinerary.liveOptions?.lodging ?? []).slice(0, 2)) {
      if (lodging.bookingUrl) targets.push({ label: `${baseLabel} lodging ${lodging.name}`, url: lodging.bookingUrl });
    }
    for (const car of (itinerary.liveOptions?.cars ?? []).slice(0, 2)) {
      if (car.bookingUrl) targets.push({ label: `${baseLabel} car ${car.provider}`, url: car.bookingUrl });
    }
  }
  return dedupeBy(targets, (target) => target.url);
}

async function probeLink(url: string, label: string, checkedAt: string, timeoutMs: number): Promise<LinkHealthRecord> {
  if (!isLikelyUrl(url)) {
    return { url, label, status: "broken", error: "Malformed URL", checkedAt };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    const status = response.ok ? "ok" : response.status >= 500 ? "warning" : "broken";
    return {
      url,
      label,
      status,
      httpStatus: response.status,
      checkedAt
    };
  } catch (error: any) {
    return {
      url,
      label,
      status: "warning",
      error: String(error?.message ?? error),
      checkedAt
    };
  } finally {
    clearTimeout(timer);
  }
}

function ensureVote(workflow: TripWorkflowState, voteType: WorkflowVoteType, decision: DecisionPackage): WorkflowVote {
  let vote = workflow.coordination.votes.find((item) => item.type === voteType);
  if (vote) return vote;
  vote = {
    type: voteType,
    title: humanizeId(voteType),
    options: voteType === "budget_approval" ? ["Approve", "Revise"] : decision.itineraries.map((it) => it.resortName),
    ballots: [],
    status: "open",
    updatedAt: new Date().toISOString()
  };
  workflow.coordination.votes.push(vote);
  return vote;
}

function computeVoteWinner(vote: WorkflowVote): string | null {
  const counts = new Map<string, number>();
  for (const ballot of vote.ballots) {
    counts.set(ballot.choice, (counts.get(ballot.choice) ?? 0) + 1);
  }
  let best: { choice: string; count: number } | null = null;
  for (const [choice, count] of counts.entries()) {
    if (!best || count > best.count) best = { choice, count };
  }
  return best?.choice ?? null;
}

function toOpsTask(task: WorkflowTask): OpsTask {
  return {
    id: task.id,
    title: task.title,
    owner: task.owner,
    dueDate: task.dueDate,
    status: task.status,
    notes: task.notes
  };
}

function inferTaskCategory(task: OpsTask): WorkflowTask["category"] {
  const raw = `${task.id} ${task.title}`.toLowerCase();
  if (raw.includes("lodging")) return "lodging";
  if (raw.includes("car") || raw.includes("transport")) return "transport";
  if (raw.includes("gear") || raw.includes("rental")) return "rentals";
  if (raw.includes("grocery")) return "groceries";
  if (raw.includes("restaurant") || raw.includes("dinner")) return "dining";
  return "general";
}

function taskExpenseCategory(task: WorkflowTask): string {
  const map: Record<WorkflowTask["category"], string> = {
    lodging: "Lodging",
    transport: "Ground Transport",
    rentals: "Gear",
    groceries: "Food",
    dining: "Food",
    general: "Travel"
  };
  return map[task.category];
}

function deriveFreshnessFromDates(
  dates: Array<string | null | undefined>,
  nowIso: string
): { state: ItinerarySourceFreshness["overall"]; maxAgeHours: number | null; latestFetchedAt: string | null } {
  const now = dayjs(nowIso);
  const valid = dates
    .filter((value): value is string => Boolean(value))
    .map((value) => dayjs(value))
    .filter((value) => value.isValid());
  if (valid.length === 0) return { state: "unknown", maxAgeHours: null, latestFetchedAt: null };
  const ages = valid.map((value) => Math.max(0, now.diff(value, "hour", true)));
  const maxAge = Math.round(Math.max(...ages));
  return {
    state: maxAge <= 12 ? "fresh" : maxAge <= 72 ? "aging" : "stale",
    maxAgeHours: maxAge,
    latestFetchedAt: valid.sort((a, b) => b.valueOf() - a.valueOf())[0].toISOString()
  };
}

function mergeFreshness(states: Array<ItinerarySourceFreshness["overall"]>): ItinerarySourceFreshness["overall"] {
  if (states.includes("stale")) return "stale";
  if (states.includes("aging")) return "aging";
  if (states.includes("fresh")) return "fresh";
  return "unknown";
}

function freshnessLabel(state: ItinerarySourceFreshness["overall"], maxAgeHours: number | null): string {
  if (state === "unknown") return "Source freshness unknown";
  if (maxAgeHours === null) return `Source freshness: ${state}`;
  return `Source freshness: ${state} (${maxAgeHours}h max age)`;
}

function buildIdMap<T>(items: T[], key: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [key(item), item]));
}

function defaultTemplates(): WorkflowTemplate[] {
  return [
    {
      id: "co_epic_weekend",
      name: "Colorado Epic Weekend",
      description: "Drive/fly-flexible Colorado weekend with mixed Epic pass coverage.",
      patch: {
        location: { state: "Colorado", confirmed: true },
        dates: { kind: "window", weekendsPreferred: true, tripLengthDays: 3 },
        notes: { passes: { epicCount: 2, noPassCount: 2, confirmed: false } as any }
      }
    },
    {
      id: "utah_ikon_flyin",
      name: "Utah Ikon Fly-in",
      description: "SLC-based fly-in template with group lodging focus.",
      patch: {
        location: { state: "Utah", confirmed: true },
        travel: { noFlying: false, arrivalAirport: "SLC", confirmed: true },
        lodgingConstraints: { kitchenRequired: true, hotTubRequired: true, constraintMode: "soft" }
      }
    },
    {
      id: "tahoe_budget_drive",
      name: "Tahoe Budget Drive",
      description: "No-pass Tahoe road trip template with tighter budget assumptions.",
      patch: {
        location: { region: "Tahoe", confirmed: true },
        travel: { noFlying: true, maxDriveHours: 5, confirmed: true },
        budget: { band: "low", confirmed: false }
      }
    }
  ];
}

function digestDecisionSnapshot(decision: DecisionPackage): string {
  const payload = {
    resorts: decision.itineraries.map((it) => ({
      id: it.id,
      resortName: it.resortName,
      dates: it.dateRange,
      cost: it.budgetEstimate?.perPersonTotal ?? null,
      topLodging: it.liveOptions?.lodging?.[0]?.name ?? null,
      topLodgingPrice: it.liveOptions?.lodging?.[0]?.groupNightlyTotalUsd ?? it.liveOptions?.lodging?.[0]?.nightlyRateUsd ?? null
    })),
    matrix: decision.decisionMatrix.map((row) => ({
      itineraryId: row.itineraryId,
      score: row.overallScore,
      cost: row.totalCostPerPerson,
      locked: row.locked
    })),
    budgetSummary: decision.budgetSummary
  };
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const valid = values.filter((v): v is string => Boolean(v)).sort();
  return valid.at(-1) ?? null;
}

function pct(value: number | null | undefined): string {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function humanizeId(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function humanizePath(value: string): string {
  return humanizeId(value.replace(/\./g, " "));
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function firstNonNull<T>(values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function maxNumber(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return null;
  return Math.max(...nums);
}

function isLikelyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
