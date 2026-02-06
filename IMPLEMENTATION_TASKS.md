# Implementation Task List

## Milestone A — Test-first guardrails for refactor
- [x] Added regression tests for:
  - [x] pass ownership missing-field gating,
  - [x] assumption-offer + proceed flow,
  - [x] final-summary URL cleanliness,
  - [x] OAuth blocked callback redirect behavior.
- [x] `npm test` passed before structural refactor.

## Milestone B — Dead code and cycle cleanup
- [x] Removed unused legacy modules:
  - [x] `src/conversations/sessions.ts`
  - [x] `src/core/validators.ts`
  - [x] `src/core/sheets.ts`
- [x] Removed unused interfaces/methods:
  - [x] follow-up LLM interface + impl code not used by runtime graph.
  - [x] unused `mistralSmallModel` export.
  - [x] unused `assertGooglePlacesConfig` export.
  - [x] unused `clearSessionCookie` helper.
- [x] Broke circular dependency:
  - [x] moved shortlist/ranking from `resorts.ts` to `resortRanking.ts`.
- [x] Validation:
  - [x] `npm test`
  - [x] `npm run build`
  - [x] `npx madge --extensions ts --circular src` (no cycles)

## Milestone C — Domain decomposition (soft file length bound)
- [x] Split budget graph into focused modules:
  - [x] `src/core/budget/index.ts`
  - [x] `src/core/budget/estimators.ts`
  - [x] `src/core/budget/origins.ts`
  - [x] `src/core/budget/types.ts`
- [x] Kept compatibility export file: `src/core/budgetGraph.ts`.
- [x] Split chat graph into focused modules:
  - [x] `src/graph/chat/index.ts`
  - [x] `src/graph/chat/assumptions.ts`
  - [x] `src/graph/chat/messaging.ts`
  - [x] `src/graph/chat/spec.ts`
- [x] Kept compatibility export file: `src/graph/chatGraph.ts`.

## Milestone D — Frontend modularization
- [x] Split monolithic frontend JS:
  - [x] `public/js/main.js`
  - [x] `public/js/session.js`
  - [x] `public/js/renderers.js`
  - [x] `public/app.js` now bootstrap-only.
- [x] Split CSS by concern:
  - [x] `public/css/base.css`
  - [x] `public/css/layout.css`
  - [x] `public/css/components.css`
  - [x] `public/styles.css` now import entrypoint.
- [x] Updated `index.html` script to module loading.

## Milestone E — Documentation refresh
- [x] Updated `README.md` with new folder layout and bootstrap guidance.
- [x] Updated `CONTEXT.md` with current behavior and architecture.
- [x] Updated `UX_LOOP_NOTES.md` and this task log to reflect refactor work.

## Refactor validation summary
- [x] Tests pass: `npm test`.
- [x] Build passes: `npm run build`.
- [x] No TS circular dependencies.
- [x] Chromium smoke flow passes on refactored frontend.

## Bugs found during this refactor loop
- [x] Initial cycle between `src/core/resorts.ts` and `src/core/snow.ts` (fixed).
- [x] Found and removed unused follow-up LLM pathway that looked active by interface but was not used by graph runtime.
- [x] New follow-up task: continue splitting long backend files still near/over soft limit (`src/llm/mistral.ts`, `src/core/itinerary.ts`, `src/core/tripSpec.ts`).
