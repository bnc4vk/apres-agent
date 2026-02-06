# Apres AI

Apres AI is a ski-trip planning webapp with a chat-first planner, itinerary options, budget feasibility checks, organizer linkouts, and Google Sheets export.

## What it does
- Captures trip constraints into a structured `TripSpec`.
- Runs deterministic missing-field progression with soft assumption mode.
- Generates 2–3 itinerary options with organizer action links.
- Runs a budget graph over pass/travel/food/gear/housing and flags unrealistic constraints.
- Exports plans to Google Sheets.

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
- `src/integrations/`: External provider adapters (Google OAuth/Sheets, SERP pricing).
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
- LLM: `LLM_PROVIDER`, `MISTRAL_API_KEY`, `MISTRAL_LARGE_MODEL`
- App/security: `BASE_URL`, `SESSION_SECRET`, `TOKEN_ENC_KEY`
- Persistence: `SUPABASE_URL`, `SUPABASE_API_KEY`, `PERSISTENCE_DRIVER`
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_PLACES_API_KEY`
- Pricing: `SERPAPI_KEY` (optional, live pricing fallback)

## Developer notes
- Keep files under ~300 lines where practical; split by concern when growing.
- Run tests after each structural refactor step.
- Check cycles with:
```bash
npx madge --extensions ts --circular src
```
