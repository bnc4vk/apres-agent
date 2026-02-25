# Workflow + Coordination + Repeatability + Integrations Roadmap

Date: 2026-02-24
Owner: Apres AI product/dev

## Goal

Move the app from "good planning demo" to a reliable trip-planning operating system for groups:

- workflow orchestration
- group coordination
- repeatable planning runs
- integration-backed execution

## What "There" Looks Like

A trip is considered "there" when a group can:

1. Collect inputs in a structured flow with minimal ambiguity.
2. Compare realistic itinerary candidates with transparent scoring/costs.
3. Collaborate on decisions (vote/comment/assign owners).
4. Lock decisions and produce a booking-ready plan.
5. Export/sync tasks and costs to external tools.
6. Re-run the plan safely with refreshed live data without losing decision history.

## Current Strengths (Preserve)

- Chat interaction is robust.
- UI is acceptably clean/minimal.
- Itinerary cards now have:
  - cost breakdown transparency
  - clearer links
  - better spacing
- Resort filtering/pass handling improved.
- Lodging options more believable with live/fallback sourcing.
- LLM profile switching exists (`mistral_free` / `openai_sota`) with final rerank/review.

## Current Gaps (Product-Level)

- Planning is still too "session-centric" vs "workflow-centric".
- Coordination is shallow (limited assignment/approval/history).
- Repeatability/auditability is partial (not enough run/version controls).
- Integrations are useful but not yet "execution-grade" across the trip lifecycle.

## Product Principles

1. Grounded first, LLM second.
2. Every important recommendation needs an explanation and source tags.
3. Distinguish assumptions vs confirmed decisions at all times.
4. Recompute should never erase user decisions silently.
5. Group planning requires ownership, approvals, and status tracking.

## Delivery Phases

### Phase 1: Workflow Spine (Highest ROI)

Build a first-class `TripPlan` workflow model and UI states.

#### Deliverables

- Trip stages:
  - `intake`
  - `candidate_compare`
  - `decision_locking`
  - `booking_prep`
  - `execution`
  - `post_trip`
- Stage completion criteria and blockers
- "Assumption vs Confirmed" badges + review queue
- Lockable decisions:
  - dates
  - resort
  - lodging
  - transport
  - budget cap
- Decision log entries with timestamps

#### Acceptance Criteria

- Users can see exactly what remains before a trip is "booking-ready".
- Recompute preserves locked decisions and explains what changed.
- Every itinerary shows source freshness + assumption tags.

### Phase 2: Coordination Layer

Add multi-user collaboration primitives to support group decisions.

#### Deliverables

- Roles:
  - planner/admin
  - member
  - approver
- Comment threads on itinerary cards and task items
- Voting/approval:
  - shortlist vote
  - final resort vote
  - lodging vote
  - budget approval
- Ownership assignments:
  - lodging booking owner
  - transport owner
  - rentals owner
  - groceries owner
- Deadline/reminder metadata on tasks

#### Acceptance Criteria

- A group can complete a trip plan without side-channel coordination (text/email).
- Every critical booking task has an owner and due date.
- Decision history explains why one option was chosen over alternatives.

### Phase 3: Repeatability + Auditability

Make planning runs reproducible and safe to compare over time.

#### Deliverables

- Saved templates (e.g. Colorado Epic weekend, Utah Ikon fly-in, Tahoe budget drive)
- Planning run metadata:
  - LLM profile/model
  - prompt/version markers
  - scoring version
  - provider/source timestamps
- Explicit recompute modes:
  - recompute with same data snapshot
  - recompute with refreshed live data
- Change diff view between runs:
  - cost changes
  - lodging availability changes
  - score/rank changes
- Exportable snapshot report (JSON/Markdown)

#### Acceptance Criteria

- Users can compare two runs and understand exactly why rankings changed.
- QA can reproduce a problematic itinerary from saved inputs + run metadata.
- Eval suite catches regressions in location/pass compliance and diversity.

### Phase 4: Integration Hardening (Execution-Grade)

Improve integrations so the app becomes a real trip execution hub.

#### Deliverables

- Calendar sync:
  - booking deadlines
  - trip milestones
  - departure/check-in/check-out
- Splitwise integration upgrades:
  - task-linked expenses
  - payer assignment defaults
  - export categories
- Google Sheets export improvements:
  - stable columns for workflow stage, assignee, confirmation status, source freshness
- Messaging integration:
  - reminder nudges
  - vote requests
  - "link expired / refresh needed" notices
- Link health validation jobs for itinerary planning links

#### Acceptance Criteria

- Export/sync outputs are stable and useful without manual cleanup.
- Broken links are surfaced proactively.
- Group reminders reduce missed bookings/deadlines.

### Phase 5: Operational Intelligence (Trip Execution)

Bring in pre-trip and in-trip operational awareness.

#### Deliverables

- Weather/snow refresh and alerts
- Lift operations status checks
- Road conditions / chain requirements
- Airport arrival + car pickup timing checks (if flying)
- "Trip week readiness" checklist state

#### Acceptance Criteria

- The plan remains useful after booking, not just before booking.
- Users get actionable warnings early enough to adjust plans.

## Engineering Backlog (Suggested Epics)

### Epic A: TripPlan Domain Model

- Add `TripPlan` entity with stage/status fields
- Add `DecisionRecord` entity (type, value, locked, source, author, timestamp)
- Add `PlanTask` entity (owner, due date, dependency, status)
- Migrate existing itinerary/session state into `TripPlan` representation

### Epic B: Workflow UI

- Stage rail / progress UI
- "Booking readiness" checklist
- Assumption review panel
- Recompute diff UI (before/after cards + score/cost deltas)

### Epic C: Coordination Core

- Roles + permissions model
- Comments API + UI
- Voting/approval API + UI
- Task assignment UI + filters (mine/all/open/blocked)

### Epic D: Repeatability + Eval

- Saved templates API + UI
- Run metadata persistence
- Snapshot export
- Expanded eval corpus + regression checks

### Epic E: Integration Hardening

- Calendar sync service
- Splitwise enrichment
- Link health checks + refresh jobs
- Notification routing (email/SMS/chat)

## Suggested Implementation Order (Pragmatic)

1. TripPlan model + task model (backend)
2. Workflow stage UI + booking-readiness checklist
3. Decision lock history + recompute diff
4. Coordination basics (assignments/comments)
5. Voting/approval
6. Template + run-versioning + snapshot export
7. Integration hardening (calendar/splitwise/link health)
8. Operational alerts (weather/roads/lift status)

## Metrics (Track from Day 1)

- `% trips reaching booking-ready stage`
- `median time to lock resort`
- `median time to lock lodging`
- `% tasks assigned`
- `% overdue tasks`
- `link health success rate`
- `recompute stability rate` (same inputs => same shortlist/ranking)
- `budget variance vs actual`
- `manual edits required after export`

## Near-Term Execution Plan (Next 2 Sprints)

### Sprint 1 (Workflow Spine)

- Implement `TripPlan`, `DecisionRecord`, `PlanTask` schemas
- Add stage/status derivation
- Add booking-readiness checklist UI
- Add assumption review queue UI
- Add recompute mode selector (`same data` vs `refresh data`)

### Sprint 2 (Coordination Basics)

- Task owners/due dates/status UI
- Comments on itinerary cards
- Decision log UI
- Basic vote/approval for resort + lodging
- Sheet export update to include workflow/owner/status columns

## Notes for Future LLM Work

- Use LLMs for:
  - extraction
  - reranking explanations
  - drafting coordination updates/messages
- Do not rely on LLMs for:
  - final prices
  - inventory truth
  - link generation validity
  - task state truth

