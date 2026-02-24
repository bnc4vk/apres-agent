import assert from "node:assert/strict";
import request from "supertest";

process.env.LLM_PROVIDER = "stub";
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
  const { createSession, handleUserMessage } = await import("../src/conversations/engine");
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
  await testConversationFlow({ createSession, handleUserMessage });
  await testGeneralizedRelativeDateExtraction({ createSession, handleUserMessage });
  await testAssumptionFlow({ createSession, handleUserMessage });
  await testAssumptionAcceptanceResolution({ createSession, handleUserMessage });
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

async function testConversationFlow(deps: any) {
  const { createSession, handleUserMessage } = deps;
  let session = createSession();
  session = await handleUserMessage(
    session,
    "We are 6 people, mixed beginner/intermediate. Feb 20-23, need rentals, mid budget, no flying, max 4 hours driving. Open to suggestions. Nobody has a pass."
  );
  let last = session.history[session.history.length - 1]?.content ?? "";
  assert.ok(last.length > 0);
  assert.ok(session.tripSpec.status.missingFields.includes("traveler_pods"));
  session = await handleUserMessage(session, "3 from SF, 3 from Sacramento");
  last = session.history[session.history.length - 1]?.content ?? "";
  assert.ok(last.toLowerCase().includes("here are 2–3 options"));
  assert.ok(!last.includes("http://"));
  assert.ok(!last.includes("https://"));
}

async function testGeneralizedRelativeDateExtraction(deps: any) {
  const { createSession, handleUserMessage } = deps;
  let session = createSession();
  session = await handleUserMessage(session, "i'm planning a trip for a group size of 8, with half of the group owning ikon");
  const firstAsk = session.history[session.history.length - 1]?.content ?? "";
  assert.ok(firstAsk.toLowerCase().includes("date"));

  session = await handleUserMessage(session, "any weekend in the next two months");
  const secondAsk = session.history[session.history.length - 1]?.content ?? "";
  assert.ok(
    !secondAsk.toLowerCase().includes("what dates are you aiming for"),
    "Should avoid repeating the exact same date follow-up"
  );
  assert.equal(session.tripSpec.dates.weekendsPreferred, true);
  assert.ok(Boolean(session.tripSpec.dates.start));
  assert.ok(Boolean(session.tripSpec.dates.end));
  assert.ok(session.tripSpec.extraction.assumptions.length > 0);
}

async function testAssumptionFlow(deps: any) {
  const { createSession, handleUserMessage } = deps;
  let session = createSession();
  session = await handleUserMessage(session, "Planning a ski trip.");
  session = await handleUserMessage(session, "Sometime in March.");
  session = await handleUserMessage(session, "Still gathering details.");
  let last = session.history[session.history.length - 1]?.content ?? "";
  assert.ok(last.toLowerCase().includes("generate itineraries now with assumptions"));

  session = await handleUserMessage(session, "Proceed with assumptions.");
  last = session.history[session.history.length - 1]?.content ?? "";
  assert.ok(last.toLowerCase().includes("here are 2–3 options"));
  assert.ok(last.toLowerCase().includes("budget check"));
}

async function testAssumptionAcceptanceResolution(deps: any) {
  const { createSession, handleUserMessage } = deps;
  let session = createSession();
  session = await handleUserMessage(session, "Planning a ski trip.");
  session = await handleUserMessage(session, "Sometime in March.");
  session = await handleUserMessage(session, "Still gathering details.");

  session = await handleUserMessage(
    session,
    "The intermediate skiers in the group hold epic passes. The rest of your assumptions are fine."
  );

  const last = session.history[session.history.length - 1]?.content ?? "";
  assert.ok(last.toLowerCase().includes("here are 2–3 options"));
  assert.ok(!session.tripSpec.status.missingFields.includes("travel_restrictions"));
  assert.ok(!session.tripSpec.status.missingFields.includes("location_input"));
}

async function testApi(deps: any) {
  const { app } = deps;
  const sessionRes = await request(app).get("/api/session");
  assert.equal(sessionRes.status, 200);
  const sessionId = sessionRes.body.sessionId as string;
  assert.ok(sessionId);
  assert.ok(Array.isArray(sessionRes.body.messages));

  const chatRes = await request(app)
    .post("/api/chat")
    .send({
      sessionId,
      message: "We are 4 people, beginners. Feb 20-23, need rentals, mid budget, no flying, max 4 hours driving. Open to suggestions. No passes."
    });
  assert.equal(chatRes.status, 200);
  assert.ok(typeof chatRes.body.reply === "string" && chatRes.body.reply.length > 0);
  assert.equal(chatRes.body.replyKind, "followup");

  const finalRes = await request(app)
    .post("/api/chat")
    .set("Cookie", sessionRes.headers["set-cookie"] ?? [])
    .send({ sessionId, message: "3 from SF, 1 from Sacramento" });
  assert.equal(finalRes.status, 200);
  assert.equal(finalRes.body.replyKind, "final");

  const refineRes = await request(app)
    .post("/api/chat")
    .set("Cookie", finalRes.headers["set-cookie"] ?? [])
    .send({ sessionId, message: "Can you make this cheaper?" });
  assert.equal(refineRes.status, 200);
  assert.ok(Array.isArray(refineRes.body.messages));
  assert.ok(refineRes.body.messages.length > finalRes.body.messages.length);

  const newChatRes = await request(app)
    .post("/api/session/new")
    .set("Cookie", refineRes.headers["set-cookie"] ?? [])
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

  const chatRes = await request(app)
    .post("/api/chat")
    .set("Cookie", sessionRes.headers["set-cookie"] ?? [])
    .send({
      sessionId,
      message:
        "8 people, Feb 20-23 2026, mixed beginner/intermediate, budget 1500, 2 Ikon 6 no pass, flying into DEN, Colorado options, need rentals for 4."
    });
  assert.equal(chatRes.status, 200);

  const tripCreate = await request(app)
    .post("/api/trips")
    .set("Cookie", chatRes.headers["set-cookie"] ?? [])
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

  const refreshRes = await request(app).post(`/api/trips/${tripId}/options/refresh`);
  assert.equal(refreshRes.status, 200);
  assert.ok(Array.isArray(refreshRes.body.decisionPackage?.decisionMatrix));
  const firstItineraryId = refreshRes.body.decisionPackage?.itineraries?.[0]?.id;
  assert.ok(firstItineraryId);

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

  const chatBootstrapRes = await request(app).post(`/api/trips/${tripId}/integrations/chat/bootstrap`);
  assert.equal(chatBootstrapRes.status, 200);
  assert.ok(chatBootstrapRes.body.decisionPackage?.opsBoard?.chatBootstrap?.inviteUrl);

  const optionsRes = await request(app).get(`/api/trips/${tripId}/options`);
  assert.equal(optionsRes.status, 200);
  assert.ok(Array.isArray(optionsRes.body.decisionPackage?.decisionMatrix));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
