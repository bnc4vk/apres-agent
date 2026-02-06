import assert from "node:assert/strict";
import request from "supertest";

process.env.LLM_PROVIDER = "stub";
process.env.PERSISTENCE_DRIVER = "memory";

async function run() {
  const { buildItineraries } = await import("../src/core/itinerary");
  const { shortlistResorts } = await import("../src/core/resortRanking");
  const { runBudgetGraph } = await import("../src/core/budgetGraph");
  const { createEmptyTripSpec, determineMissingFields, mergeTripSpec } = await import("../src/core/tripSpec");
  const { createSession, handleUserMessage } = await import("../src/conversations/engine");
  const { app } = await import("../src/app");
  const { resolveDatesPatch } = await import("../src/tools/dateResolution");

  testMissingFields({ createEmptyTripSpec, determineMissingFields, mergeTripSpec });
  testPassMissingField({ createEmptyTripSpec, determineMissingFields, mergeTripSpec });
  testGearAutoConfirm({ createEmptyTripSpec, mergeTripSpec, determineMissingFields });
  testDateResolution({ resolveDatesPatch });
  testResortShortlist({ createEmptyTripSpec, mergeTripSpec, shortlistResorts });
  await testBudgetGraph({ createEmptyTripSpec, mergeTripSpec, buildItineraries, runBudgetGraph });
  testItineraryBuilder({ createEmptyTripSpec, mergeTripSpec, buildItineraries });
  await testConversationFlow({ createSession, handleUserMessage });
  await testAssumptionFlow({ createSession, handleUserMessage });
  await testApi({ app });
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

function testDateResolution(deps: any) {
  const { resolveDatesPatch } = deps;
  const now = new Date("2026-02-05T12:00:00Z");
  const lateThisMonth = resolveDatesPatch("Ideally late this month.", {}, now);
  assert.equal(lateThisMonth?.dates?.start, "2026-02-21");
  assert.equal(lateThisMonth?.dates?.end, "2026-02-28");

  const marchWindow = resolveDatesPatch("Sometime in March.", {}, now);
  assert.equal(marchWindow?.dates?.start, "2026-03-01");
  assert.equal(marchWindow?.dates?.end, "2026-03-31");

  const marchYear = resolveDatesPatch("March 2026", {}, now);
  assert.equal(marchYear?.dates?.start, "2026-03-01");
  assert.equal(marchYear?.dates?.end, "2026-03-31");

  const januaryNextYear = resolveDatesPatch("Late January works.", {}, now);
  assert.equal(januaryNextYear?.dates?.start, "2027-01-21");
  assert.equal(januaryNextYear?.dates?.end, "2027-01-31");
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

async function testConversationFlow(deps: any) {
  const { createSession, handleUserMessage } = deps;
  let session = createSession();
  session = await handleUserMessage(
    session,
    "We are 6 people, mixed beginner/intermediate. Feb 20-23, need rentals, mid budget, no flying, max 4 hours driving. Open to suggestions. Nobody has a pass."
  );
  let last = session.history[session.history.length - 1]?.content ?? "";
  assert.ok(last.toLowerCase().includes("departure locations"));
  session = await handleUserMessage(session, "3 from SF, 3 from Sacramento");
  last = session.history[session.history.length - 1]?.content ?? "";
  assert.ok(last.toLowerCase().includes("here are 2–3 options"));
  assert.ok(!last.includes("http://"));
  assert.ok(!last.includes("https://"));
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
  assert.ok(last.toLowerCase().includes("proceeding with itinerary generation using assumptions"));
  assert.ok(last.toLowerCase().includes("budget check"));
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
  assert.ok(String(chatRes.body.reply).toLowerCase().includes("departure locations"));
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
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
