# UX Improvement Loop Notes

## Iteration 4 — Budget realism + companion planning

Issue:
- Budgeting was disconnected from itinerary output.
- Pass ownership (Ikon/Epic/etc.) was not first-class in intake gating.
- Long raw URLs cluttered final assistant messages.
- Post-final auto-reset interrupted natural refinement behavior.

Fix:
- Added budget graph over pass/travel/food/gear/housing.
- Added feasibility warnings when constraints are unrealistic.
- Added pass ownership to `TripSpec` missing-field progression.
- Removed raw URL dumps from final summary and routed links to itinerary action chips.
- Switched post-final behavior to refine in same thread.
- Added soft assumption-offer flow by ~turn 3.

Validation:
- `npm test` and `npm run build` pass.
- Chromium flows pass under deterministic test runtime.

## Iteration 5 — Minimalist alpine UI + reduced overhead

Issue:
- Prior UI had high visual weight and unnecessary overhead during planning.

Fix:
- Reworked to light, minimalist alpine styling.
- Hid `New trip` until itinerary completion.
- Switched send CTA to `Refine` after final output.
- Added dynamic input hinting and budget summary card.
- Kept itinerary link actions compact and scannable.

Validation:
- Chromium desktop/mobile checks passed.

## Iteration 6 — OAuth blocked-state resilience

Issue:
- OAuth blocked or denied paths did not provide sufficient in-app guidance.

Fix:
- Added blocked callback handling and user-facing guidance message.
- Reduced OAuth scopes to Sheets/Drive-only.

Validation:
- Chromium blocked-path check passed.

## Iteration 7 — Repo maintainability refactor

Issue:
- Monolithic files, dead code paths, and import cycle risk were increasing maintenance cost.

Fix:
- Removed unused modules/helpers/interfaces.
- Broke one real cycle (`resorts.ts` ↔ `snow.ts`) by extracting `resortRanking.ts`.
- Split backend graph/domain logic into focused modules:
  - `src/graph/chat/*`
  - `src/core/budget/*`
- Split frontend app and styles into modules:
  - `public/js/*`
  - `public/css/*`
- Added refactor-focused regression tests and revalidated after each stage.

Validation:
- `npm test` passed at each major refactor stage.
- `npm run build` passed at each major refactor stage.
- Cycle scan clean: `npx madge --extensions ts --circular src`.
- Chromium smoke run passed after frontend decomposition.

Open follow-up:
- Further split large but still manageable files (`src/llm/mistral.ts`, `src/core/itinerary.ts`, `src/core/tripSpec.ts`) if they continue to grow.
