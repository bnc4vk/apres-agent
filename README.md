# Apres AI

Apres AI is a ski-trip planning webapp with a chat-first planner, trip-scoped APIs, live/estimated supplier optioning, organizer automation workflows, and Google Sheets Ops Board export.

## What it does
- Captures trip constraints into `TripSpecV2` (group composition, lodging/dining constraints, organizer ops).
- Runs deterministic missing-field progression with soft assumption mode.
- Generates 2–3 itinerary options with decision matrix scoring + lock/recompute flow.
- Pulls live-or-estimated lodging/car/POI options through provider abstractions with provenance labels.
- Runs a budget graph over pass/travel/food/gear/housing and flags unrealistic constraints.
- Supports trip APIs (`/api/trips/*`) for refresh, integrations bootstrap, and trip export.
- Exports an Ops Board Google Sheet (Decision Matrix, Vendors, Tasks, Costs, Comms).

## Quick start
```bash
npm install
npm run dev
```
Open `http://localhost:5001`.

## Test and build
```bash
npm test
npm run build
npm run eval:trip
```

## Repo structure

### Backend
- `src/app.ts`: Express app and route wiring.
- `src/server.ts`: Process entrypoint.
- `src/routes/`: API route handlers.
- `src/conversations/`: Session/conversation orchestration.
- `src/graph/chat/`: Chat graph implementation split by concern.
  - `index.ts`: graph construction and run function.
  - `assumptions.ts`: assumption/force-generate behavior.
  - `messaging.ts`: follow-up/final response formatting.
  - `spec.ts`: issue detection and auto-confirm rules.
- `src/core/`: Domain logic.
  - `budget/`: budget graph modules.
  - `itinerary.ts`, `itineraryExpansion.ts`, `decision.ts`, `poi.ts`, `snow.ts`, `tripSpec.ts`.
  - `resorts.ts`: resort dataset.
  - `resortRanking.ts`: shortlist/ranking logic.
- `src/integrations/`: External provider adapters (Google OAuth/Sheets/Places v1, Booking Demand, Splitwise, Twilio, SERP fallback).
- `src/providers/`: Provider abstraction layer (`LodgingProvider`, `CarProvider`, `PoiProvider`).
- `src/persistence/`: memory + Supabase stores.
- `src/http/`, `src/security/`, `src/tools/`: shared utilities.

### Frontend
- `public/index.html`: shell.
- `public/app.js`: frontend bootstrap (module entry).
- `public/js/`: frontend modules.
  - `main.js`: app orchestration.
  - `session.js`: API client calls.
  - `renderers.js`: UI rendering.
- `public/styles.css`: CSS entry.
- `public/css/`: split style modules (`base.css`, `layout.css`, `components.css`).

### Tests
- `test/run.ts`: unit/API regression suite.

## Environment variables
- LLM:
  - `LLM_PROFILE` = `mistral_free` | `mistral_paid` | `openai_sota` | `stub`
  - `MISTRAL_API_KEY`, `MISTRAL_FREE_MODEL`, `MISTRAL_PAID_MODEL`
  - `OPENAI_API_KEY`, `OPENAI_SOTA_MODEL`
  - `LLM_REASONING_REVIEW_ENABLED` (default `true`) toggles LLM rerank/explanation on top of deterministic candidates
- App/security: `BASE_URL`, `SESSION_SECRET`, `TOKEN_ENC_KEY`
- Persistence: `SUPABASE_URL`, `SUPABASE_API_KEY`, `PERSISTENCE_DRIVER`, `CHAT_PERSISTENCE_ENABLED`
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_PLACES_API_KEY`
- Pricing: `SERPAPI_KEY` (optional fallback)
- Booking: `BOOKING_API_KEY`, `BOOKING_API_BASE_URL`
- Splitwise: `SPLITWISE_ACCESS_TOKEN`, `SPLITWISE_API_BASE_URL`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_CONVERSATIONS_SERVICE_SID`

### Eval examples
```bash
LLM_PROFILE=mistral_free npm run eval:trip
LLM_PROFILE=openai_sota npm run eval:trip
EVAL_LLM_PROFILES=mistral_free,openai_sota npm run eval:trip
```

## Developer notes
- Keep files under ~300 lines where practical; split by concern when growing.
- Run tests after each structural refactor step.
- Check cycles with:
```bash
npx madge --extensions ts --circular src
```
