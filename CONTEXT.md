# Apres AI — Current Thread Handoff Context

## Project snapshot
- Repo path: `/Users/bencohen/Desktop/apres-agent`
- App name: **Apres AI**
- Dev URL: `http://localhost:5001`
- Stack: Node + Express + TypeScript + LangGraph + Mistral
- Persistence: Supabase-backed session/conversation store (`app_sessions`, `app_conversations`, `app_messages`, `app_google_tokens`)
- Test persistence mode: in-memory store via `PERSISTENCE_DRIVER=memory`

## Product goal
- Ski-group organizers need to capture constraints quickly, generate itinerary options, stress-test budget realism, and centralize planning artifacts (especially Google Sheets + research links).

## What is implemented now

### 1) Intake, graph flow, and assumptions
- LangGraph intake flow persists full conversation + `TripSpec`.
- Missing-field progression is deterministic by top missing field.
- Soft assumption mode appears after sparse multi-turn input and supports explicit “proceed with assumptions”.
- Date resolution handles fuzzy/month phrasing and month+year windows.

### 2) Budget intelligence
- Budget graph estimates per-person totals across:
  - pass,
  - flights/travel,
  - food,
  - gear rental,
  - housing.
- Feasibility warnings are surfaced when constraints are unrealistic.
- Budget summary is attached to the decision package and surfaced in UI + final summary.

### 3) Session and chat behavior
- Signed session cookie support.
- Supabase persistence with memory fallback in tests.
- Full chat reload on refresh.
- **Current behavior:** post-final follow-up messages refine in same thread.
- Explicit reset remains available via `New trip` button + `POST /api/session/new`.

### 4) Google integrations
- OAuth endpoints: `/api/auth/google/start`, `/api/auth/google/callback`.
- Sheets export endpoint: `/api/export/sheets`.
- OAuth blocked path redirects to app with `?google=blocked` and shows user guidance.
- Sheet export includes Summary/Itineraries/POIs/Logistics tabs and budget-related columns.
- Drive permission set to `anyone` + `writer`.

### 5) POI + organizer actions
- Google Places for gear/grocery/restaurants with fallback behavior.
- Per-itinerary action chips for lodging/gear/grocery/takeout/cars.
- Itinerary expansion endpoint remains available.

### 6) UI state
- Light minimalist two-column desktop workspace + mobile single-column fallback.
- Reduced UI overhead: `New trip` hidden until itinerary completion, send CTA changes to `Refine` after final.
- Assistant URLs are rendered as links; final summary avoids raw URL dumps.

## Current API surface (not exhaustive)
- `GET /api/session`
- `POST /api/chat`
- `POST /api/session/new`
- `POST /api/itinerary/expand`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `POST /api/export/sheets`

## Code layout (post-refactor)
- `src/graph/chat/`: chat graph split by concern (`index.ts`, `assumptions.ts`, `messaging.ts`, `spec.ts`)
- `src/core/budget/`: budget graph modules (`index.ts`, `estimators.ts`, `origins.ts`, `types.ts`)
- `src/core/resorts.ts`: dataset
- `src/core/resortRanking.ts`: shortlist/ranking
- `public/js/`: frontend modules (`main.js`, `renderers.js`, `session.js`)
- `public/css/`: style modules (`base.css`, `layout.css`, `components.css`)
- Compatibility shim files preserved for import stability:
  - `src/graph/chatGraph.ts` → re-exports from `src/graph/chat/index.ts`
  - `src/core/budgetGraph.ts` → re-exports from `src/core/budget/index.ts`

## Thread execution notes (Feb 6, 2026)
- Performed deep dependency audit and removed unused legacy paths:
  - deleted `src/conversations/sessions.ts`
  - deleted `src/core/validators.ts`
  - deleted `src/core/sheets.ts`
  - removed unused LLM follow-up method/interface and stale config/util exports.
- Resolved real TypeScript import cycle detected by `madge`:
  - previous cycle: `src/core/resorts.ts` ↔ `src/core/snow.ts`
  - fix: moved shortlist/ranking behavior into `src/core/resortRanking.ts`.
- Frontend was decomposed from monolithic files into module folders (`public/js`, `public/css`) and `index.html` now loads app entry as ES module.
- Refactor safety process used repeatedly at each stage:
  - run `npm test`
  - run `npm run build`
  - run `npx madge --extensions ts --circular src`
  - run Chromium smoke for planner flow/UI sanity.

## Validation status
- `npm test` passes.
- `npm run build` passes.
- Cycle scan passes: `npx madge --extensions ts --circular src`.
- Chromium smoke pass completed on refactored frontend.

## Known follow-up tasks
- Improve live-model extraction reliability for deterministic finalize within ~3 informative turns.
- Reduce long final assistant text density via sectioned rendering.
- Add optional project-specific OAuth remediation CTA link.
- Expand resort/POI coverage and deepen car pricing signals.
