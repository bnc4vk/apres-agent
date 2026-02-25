import assert from "node:assert/strict";
import request from "supertest";

process.env.LLM_PROVIDER = "stub";
process.env.LLM_PROFILE = "stub";
process.env.PERSISTENCE_DRIVER = "memory";
process.env.BOOKING_API_KEY = "";
process.env.GOOGLE_PLACES_API_KEY = "";
process.env.SERPAPI_KEY = "";
process.env.SPLITWISE_ACCESS_TOKEN = "";
process.env.TWILIO_ACCOUNT_SID = "";
process.env.TWILIO_AUTH_TOKEN = "";
process.env.TWILIO_CONVERSATIONS_SERVICE_SID = "";

async function run() {
  const { buildItineraries } = await import("../src/core/itinerary");
  const { shortlistResorts } = await import("../src/core/resortRanking");
  const { runBudgetGraph } = await import("../src/core/budgetGraph");
  const { buildDecisionPackage } = await import("../src/core/decision");
  const { createEmptyTripSpec, determineMissingFields, mergeTripSpec } = await import("../src/core/tripSpec");
  const { loadConversationByTripId } = await import("../src/conversations/sessionService");
  const { app } = await import("../src/app");

  testMissingFields({ createEmptyTripSpec, determineMissingFields, mergeTripSpec });
  testPassMissingField({ createEmptyTripSpec, determineMissingFields, mergeTripSpec });
  testGearAutoConfirm({ createEmptyTripSpec, mergeTripSpec, determineMissingFields });
  testResortShortlist({ createEmptyTripSpec, mergeTripSpec, shortlistResorts });
  testStateFilterNoFallback({ createEmptyTripSpec, mergeTripSpec, shortlistResorts });
  testOpenSuggestionsDoesNotOverrideExplicitState({ createEmptyTripSpec, mergeTripSpec, shortlistResorts });
  await testBudgetGraph({ createEmptyTripSpec, mergeTripSpec, buildItineraries, runBudgetGraph });
  testItineraryBuilder({ createEmptyTripSpec, mergeTripSpec, buildItineraries });
  await testHardConstraintLodging({ createEmptyTripSpec, mergeTripSpec, buildDecisionPackage });
  testRelaxedLocationMatching({ createEmptyTripSpec, mergeTripSpec, shortlistResorts });
  testMixedPassNotesInference({ createEmptyTripSpec, mergeTripSpec });
  await testApi({ app });
  await testTripApis({ app, loadConversationByTripId });
  console.log("All tests passed.");
}

function testMissingFields(deps: any) {
  const { createEmptyTripSpec, determineMissingFields, mergeTripSpec } = deps;
  const spec = createEmptyTripSpec();
  const updated = mergeTripSpec(spec, {
    travel: { noFlying: true, confirmed: true },
    dates: { start: "2026-02-20", end: "2026-02-23", yearConfirmed: true },
    group: { size: 4, skillLevels: ["beginner"] },
    gear: { rentalRequired: true, confirmed: true },
    budget: { band: "mid", confirmed: true },
    notes: { passes: { noPassCount: 4, confirmed: true } },
    location: { region: "Tahoe", confirmed: true }
  });
  const missing = determineMissingFields(updated);
  assert.ok(missing.includes("traveler_pods"));
}

function testGearAutoConfirm(deps: any) {
  const { createEmptyTripSpec, mergeTripSpec, determineMissingFields } = deps;
  const spec = mergeTripSpec(createEmptyTripSpec(), {
    dates: { start: "2026-03-21", end: "2026-03-24" },
    group: { size: 6, skillLevels: ["beginner", "intermediate"] },
    budget: { perPersonMax: 650, confirmed: true },
    travel: { noFlying: true, maxDriveHours: 4, confirmed: true },
    location: { region: "Tahoe", confirmed: true },
    travelers: { pods: [{ origin: "SF", count: 3 }, { origin: "Sacramento", count: 3 }] },
    gear: { rentalCount: 4 },
    notes: { passes: { noPassCount: 6, confirmed: true } }
  });
  const missing = determineMissingFields(spec);
  assert.ok(!missing.includes("gear_rental"));
}

function testPassMissingField(deps: any) {
  const { createEmptyTripSpec, mergeTripSpec, determineMissingFields } = deps;
  const spec = mergeTripSpec(createEmptyTripSpec(), {
    dates: { start: "2026-03-21", end: "2026-03-24" },
    group: { size: 6, skillLevels: ["beginner", "intermediate"] },
    budget: { perPersonMax: 650, confirmed: true },
    travel: { noFlying: true, maxDriveHours: 4, confirmed: true },
    location: { region: "Tahoe", confirmed: true },
    travelers: { pods: [{ origin: "SF", count: 3 }, { origin: "Sacramento", count: 3 }] },
    gear: { rentalCount: 4 }
  });
  const missing = determineMissingFields(spec);
  assert.ok(missing.includes("passes"));
}

function testResortShortlist(deps: any) {
  const { createEmptyTripSpec, mergeTripSpec, shortlistResorts } = deps;
  const spec = mergeTripSpec(createEmptyTripSpec(), {
    location: { region: "Tahoe", confirmed: true },
    dates: { start: "2026-02-20", end: "2026-02-23", yearConfirmed: true },
    group: { size: 4, skillLevels: ["beginner"] },
    gear: { rentalRequired: false, confirmed: true },
    budget: { band: "mid", confirmed: true },
    notes: { passes: { noPassCount: 4, confirmed: true } },
    travel: { noFlying: false, confirmed: true }
  });
  const resorts = shortlistResorts(spec, 3);
  assert.ok(resorts.length > 0);
  assert.ok(resorts.every((resort) => resort.region.toLowerCase().includes("tahoe")));
}

function testStateFilterNoFallback(deps: any) {
  const { createEmptyTripSpec, mergeTripSpec, shortlistResorts } = deps;
  const spec = mergeTripSpec(createEmptyTripSpec(), {
    location: { state: "Utah", confirmed: true },
    dates: { start: "2026-03-14", end: "2026-03-18", yearConfirmed: true },
    group: { size: 8, skillLevels: ["beginner", "intermediate"] },
    gear: { rentalRequired: true, confirmed: true },
    budget: { band: "mid", confirmed: true },
    notes: { passes: { noPassCount: 8, confirmed: true } },
    travel: { noFlying: false, confirmed: true }
  });
  const resorts = shortlistResorts(spec, 3);
  assert.ok(resorts.length > 0);
  assert.ok(resorts.every((resort) => resort.state === "Utah"));
}

function testOpenSuggestionsDoesNotOverrideExplicitState(deps: any) {
  const { createEmptyTripSpec, mergeTripSpec, shortlistResorts } = deps;
  const spec = mergeTripSpec(createEmptyTripSpec(), {
    location: { state: "Colorado", openToSuggestions: true, confirmed: true },
    dates: { start: "2026-03-14", end: "2026-03-18", yearConfirmed: true },
    group: { size: 6, skillLevels: ["advanced", "beginner"] },
    gear: { rentalRequired: true, confirmed: true },
    budget: { band: "mid", confirmed: true },
    notes: { passes: { epicCount: 3, noPassCount: 3, confirmed: true } },
    travel: { noFlying: false, confirmed: true }
  });
  const resorts = shortlistResorts(spec, 5);
  assert.ok(resorts.length > 0);
  assert.ok(resorts.every((resort) => resort.state === "Colorado"));
}

function testItineraryBuilder(deps: any) {
  const { createEmptyTripSpec, mergeTripSpec, buildItineraries } = deps;
  const spec = mergeTripSpec(createEmptyTripSpec(), {
    travel: { noFlying: false, confirmed: true },
    dates: { start: "2026-02-20", end: "2026-02-23", yearConfirmed: true },
    group: { size: 4, skillLevels: ["beginner", "intermediate"] },
    gear: { rentalRequired: true, confirmed: true },
    budget: { band: "mid", confirmed: true },
    notes: { passes: { noPassCount: 4, confirmed: true } },
    location: { region: "Tahoe", confirmed: true },
    travelers: { pods: [{ origin: "San Francisco", count: 4 }] }
  });
  const decision = buildItineraries(spec);
  assert.ok(decision.itineraries.length >= 2 && decision.itineraries.length <= 3);
}

async function testBudgetGraph(deps: any) {
  const { createEmptyTripSpec, mergeTripSpec, buildItineraries, runBudgetGraph } = deps;
  const spec = mergeTripSpec(createEmptyTripSpec(), {
    travel: { noFlying: false, confirmed: true },
    dates: { start: "2026-03-06", end: "2026-03-08", yearConfirmed: true },
    group: { size: 8, skillLevels: ["intermediate", "advanced"] },
    gear: { rentalRequired: true, rentalCount: 4, confirmed: true },
    budget: { perPersonMax: 500, currency: "USD", confirmed: true },
    notes: { passes: { noPassCount: 8, confirmed: true } },
    location: { state: "Colorado", confirmed: true },
    travelers: { pods: [{ origin: "NYC", count: 8 }] }
  });
  const plan = buildItineraries(spec);
  const budget = await runBudgetGraph(spec, plan.itineraries);
  assert.ok(budget.summary.bestPerPersonTotal > 0);
  assert.equal(budget.summary.feasible, false);
  assert.ok(budget.summary.shortfallPerPerson > 0);
}

async function testHardConstraintLodging(deps: any) {
  const { createEmptyTripSpec, mergeTripSpec, buildDecisionPackage } = deps;
  const spec = mergeTripSpec(createEmptyTripSpec(), {
    travel: { noFlying: false, confirmed: true, arrivalAirport: "SLC" },
    dates: { start: "2026-03-14", end: "2026-03-18", yearConfirmed: true },
    group: { size: 12, skillLevels: ["beginner", "intermediate", "advanced"] },
    groupComposition: { couplesCount: 5, singlesCount: 2, roomingStyle: "hybrid", confirmed: true },
    gear: { rentalRequired: true, confirmed: true },
    budget: { perPersonMax: 1800, confirmed: true },
    notes: { passes: { ikonCount: 8, noPassCount: 4, confirmed: true } },
    location: { state: "Utah", confirmed: true },
    lodgingConstraints: {
      maxWalkMinutesToLift: 1,
      hotTubRequired: true,
      laundryRequired: true,
      minBedrooms: 20,
      kitchenRequired: true,
      constraintMode: "hard",
      confirmed: true
    },
    diningConstraints: {
      mustSupportTakeout: true,
      mustBeReservable: true,
      minGroupCapacity: 12,
      constraintMode: "hard",
      confirmed: true
    }
  });
  const decision = await buildDecisionPackage(spec);
  assert.ok(decision.itineraries.length > 0);
  assert.ok(
    decision.itineraries.every((item) => (item.liveOptions?.lodging?.length ?? 0) === 0),
    "Expected hard constraints to eliminate all fallback lodging options"
  );
  assert.ok(
    decision.itineraries.some((item) =>
      item.warnings.some((warning) => warning.toLowerCase().includes("no lodging options matched"))
    )
  );
}

function testRelaxedLocationMatching(deps: any) {
  const { createEmptyTripSpec, mergeTripSpec, shortlistResorts } = deps;
  const spec = mergeTripSpec(createEmptyTripSpec(), {
    location: { region: "Park City / Cottonwoods", openToSuggestions: false, confirmed: true },
    dates: { start: "2026-03-20", end: "2026-03-23", yearConfirmed: true },
    group: { size: 8, skillLevels: ["beginner", "intermediate", "advanced"] },
    gear: { rentalRequired: true, confirmed: true },
    budget: { perPersonMax: 2200, confirmed: true },
    notes: { passes: { noPassCount: 8, confirmed: true } },
    travel: { noFlying: true, maxDriveHours: 6, confirmed: true },
    travelers: { pods: [{ origin: "SLC", count: 8 }] }
  });
  const resorts = shortlistResorts(spec, 3);
  assert.ok(resorts.length > 0);
  assert.ok(resorts.every((resort) => resort.state === "Utah"));
}

function testMixedPassNotesInference(deps: any) {
  const { createEmptyTripSpec, mergeTripSpec } = deps;
  const spec = mergeTripSpec(createEmptyTripSpec(), {
    group: { size: 8 },
    notes: { passes: { notes: "2 Ikon, 1 Epic, 5 no pass" } }
  });
  assert.equal(spec.notes.passes?.ikonCount, 2);
  assert.equal(spec.notes.passes?.epicCount, 1);
  assert.equal(spec.notes.passes?.noPassCount, 5);
}

async function testApi(deps: any) {
  const { app } = deps;
  const sessionRes = await request(app).get("/api/session");
  assert.equal(sessionRes.status, 200);
  const sessionId = sessionRes.body.sessionId as string;
  assert.ok(sessionId);
  assert.ok(Array.isArray(sessionRes.body.messages));

  const removedChatRes = await request(app).post("/api/chat").send({ sessionId, message: "hello" });
  assert.equal(removedChatRes.status, 404);

  const newChatRes = await request(app)
    .post("/api/session/new")
    .set("Cookie", sessionRes.headers["set-cookie"] ?? [])
    .send({ sessionId });
  assert.equal(newChatRes.status, 200);
  assert.ok(Array.isArray(newChatRes.body.messages));
  assert.equal(newChatRes.body.messages.length, 1);
  assert.equal(newChatRes.body.decisionPackage, null);

  const blockedOAuthRes = await request(app).get("/api/auth/google/callback?error=access_denied");
  assert.equal(blockedOAuthRes.status, 302);
  assert.ok(String(blockedOAuthRes.headers.location).includes("google=blocked"));

  const labelsRes = await request(app).get("/api/meta/field-labels");
  assert.equal(labelsRes.status, 200);
  assert.equal(labelsRes.body.fieldLabels?.dates, "Dates");
}

async function testTripApis(deps: any) {
  const { app, loadConversationByTripId } = deps;
  const sessionRes = await request(app).get("/api/session");
  const sessionId = sessionRes.body.sessionId as string;
  assert.ok(sessionId);

  const tripCreate = await request(app)
    .post("/api/trips")
    .set("Cookie", sessionRes.headers["set-cookie"] ?? [])
    .send({ sessionId });
  assert.equal(tripCreate.status, 200);
  const tripId = tripCreate.body.tripId as string;
  assert.ok(tripId);

  const loadedByTrip = await loadConversationByTripId(tripId);
  assert.ok(loadedByTrip);
  assert.equal(loadedByTrip?.sessionId, sessionId);
  assert.equal(loadedByTrip?.session.id, loadedByTrip?.conversation.sessionPk);

  const patchRes = await request(app)
    .patch(`/api/trips/${tripId}/spec`)
    .send({
      group: { size: 8, skillLevels: ["beginner", "intermediate"] },
      gear: { rentalRequired: true, rentalCount: 4, confirmed: true },
      budget: { perPersonMax: 1800, currency: "USD", band: "mid", confirmed: true },
      travel: { noFlying: false, arrivalAirport: "DEN", confirmed: true },
      dates: { start: "2026-02-20", end: "2026-02-23", kind: "exact", tripLengthDays: 4, yearConfirmed: true },
      location: { state: "Colorado", openToSuggestions: false, confirmed: true },
      travelers: { pods: [{ origin: "NYC", count: 8 }] },
      notes: { passes: { ikonCount: 2, noPassCount: 6, confirmed: true } },
      lodgingConstraints: {
        maxWalkMinutesToLift: 12,
        hotTubRequired: true,
        laundryRequired: true,
        minBedrooms: 4,
        kitchenRequired: true,
        constraintMode: "hard",
        confirmed: true
      },
      diningConstraints: {
        mustSupportTakeout: true,
        minGroupCapacity: 8,
        mustBeReservable: true,
        constraintMode: "hard",
        confirmed: true
      }
    });
  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.body.tripSpec?.status?.readyToGenerate, true);

  const refreshRes = await request(app).post(`/api/trips/${tripId}/options/refresh`);
  assert.equal(refreshRes.status, 200);
  assert.ok(Array.isArray(refreshRes.body.decisionPackage?.decisionMatrix));
  assert.ok(refreshRes.body.decisionPackage?.workflow);
  const firstItineraryId = refreshRes.body.decisionPackage?.itineraries?.[0]?.id;
  assert.ok(firstItineraryId);

  const sameSnapshotRecomputeRes = await request(app)
    .post(`/api/trips/${tripId}/options/recompute`)
    .send({ mode: "same_snapshot" });
  assert.equal(sameSnapshotRecomputeRes.status, 200);
  assert.equal(sameSnapshotRecomputeRes.body.decisionPackage?.workflow?.repeatability?.lastRecomputeMode, "same_snapshot");
  assert.ok(
    typeof sameSnapshotRecomputeRes.body.decisionPackage?.workflow?.repeatability?.latestDiff?.summary === "string" ||
      sameSnapshotRecomputeRes.body.decisionPackage?.workflow?.repeatability?.latestDiff === null
  );

  const workflowActionsRes = await request(app)
    .post(`/api/trips/${tripId}/workflow/actions`)
    .send({
      actions: [
        { type: "task_patch", taskId: "booking-deposit", owner: "Lodging lead", dueDate: "2026-02-01" },
        { type: "vote_cast", voteType: "budget_approval", choice: "Approve" },
        { type: "comment_add", targetType: "task", targetId: "booking-deposit", message: "Deposit owner confirmed." }
      ]
    });
  assert.equal(workflowActionsRes.status, 200);
  assert.ok(
    workflowActionsRes.body.decisionPackage?.workflow?.coordination?.tasks?.some(
      (task: any) => task.id === "booking-deposit" && task.owner === "Lodging lead"
    )
  );
  assert.ok(
    workflowActionsRes.body.decisionPackage?.workflow?.coordination?.comments?.some(
      (comment: any) => comment.targetId === "booking-deposit"
    )
  );

  const opsRefreshRes = await request(app).post(`/api/trips/${tripId}/operations/refresh`);
  assert.equal(opsRefreshRes.status, 200);
  assert.ok(Array.isArray(opsRefreshRes.body.decisionPackage?.workflow?.operations?.checks));

  const snapshotRes = await request(app).get(`/api/trips/${tripId}/workflow/snapshot`);
  assert.equal(snapshotRes.status, 200);
  assert.ok(snapshotRes.body.snapshotReport);
  assert.ok(typeof snapshotRes.body.snapshotMarkdown === "string");

  const expandRes = await request(app).post(
    `/api/trips/${tripId}/itineraries/${encodeURIComponent(firstItineraryId)}/expand`
  );
  assert.equal(expandRes.status, 200);
  assert.ok(Array.isArray(expandRes.body.messages));

  const lockRes = await request(app).patch(`/api/trips/${tripId}/spec`).send({
    locks: {
      lockedResortName: "Keystone",
      lockedItineraryId: "keystone-1"
    }
  });
  assert.equal(lockRes.status, 200);

  const splitwiseRes = await request(app).post(`/api/trips/${tripId}/integrations/splitwise/bootstrap`);
  assert.equal(splitwiseRes.status, 200);
  assert.ok(splitwiseRes.body.decisionPackage?.opsBoard?.splitwiseBootstrap?.groupId);
  assert.ok(typeof splitwiseRes.body.decisionPackage?.opsBoard?.splitwiseBootstrap?.seededExpenseCount === "number");

  const splitwisePlanRes = await request(app).get(`/api/trips/${tripId}/integrations/splitwise/plan`);
  assert.equal(splitwisePlanRes.status, 200);
  assert.ok(Array.isArray(splitwisePlanRes.body.plannedExpenses));

  const chatBootstrapRes = await request(app).post(`/api/trips/${tripId}/integrations/chat/bootstrap`);
  assert.equal(chatBootstrapRes.status, 200);
  assert.ok(chatBootstrapRes.body.decisionPackage?.opsBoard?.chatBootstrap?.inviteUrl);
  assert.ok(chatBootstrapRes.body.decisionPackage?.opsBoard?.chatBootstrap?.conversationSid);

  const notifyRes = await request(app).post(`/api/trips/${tripId}/integrations/chat/notify`).send({
    kinds: ["deadline", "vote"]
  });
  assert.equal(notifyRes.status, 200);
  assert.ok(typeof notifyRes.body.sentCount === "number");
  assert.ok(["live", "simulated"].includes(notifyRes.body.mode));

  const calIcsRes = await request(app).get(`/api/trips/${tripId}/integrations/calendar.ics`);
  assert.equal(calIcsRes.status, 200);
  assert.ok(String(calIcsRes.headers["content-type"]).includes("text/calendar"));
  assert.ok(String(calIcsRes.text).includes("BEGIN:VCALENDAR"));

  const calSyncRes = await request(app).post(`/api/trips/${tripId}/integrations/calendar/sync`);
  assert.equal(calSyncRes.status, 200);
  assert.ok(typeof calSyncRes.body.insertedCount === "number");
  assert.ok(calSyncRes.body.decisionPackage?.workflow?.integrations?.calendarDraft?.lastSyncSummary);

  const optionsRes = await request(app).get(`/api/trips/${tripId}/options`);
  assert.equal(optionsRes.status, 200);
  assert.ok(Array.isArray(optionsRes.body.decisionPackage?.decisionMatrix));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
