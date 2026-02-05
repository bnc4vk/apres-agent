# Apres AI — thread context summary

## Project snapshot
- Repo: `/Users/bencohen/Desktop/apres-agent`
- Current name/branding: **Apres AI** (UI + README + server log updated)
- Default dev server port: `5001`
- Chat flow: LangGraph orchestration + Mistral SDK structured outputs
- LLM provider: Mistral (models: `mistral-large-latest`, `mistral-small-latest`)
- `.env` expected: `MISTRAL_API_KEY`, `LLM_PROVIDER`, `MISTRAL_LARGE_MODEL`, `MISTRAL_SMALL_MODEL`
- No git remote configured yet; local commit exists (`Rebrand to Apres AI`)

## Key actions completed
- **Removed all regex/keyword extraction**; trip spec updates are **LLM-only** with structured outputs + evidence gating.
- **Added LangGraph flow** with nodes:
  - append user → spec patch → merge → date resolution → issue check → route → follow-up / finalize.
- **Implemented deterministic date resolution tool** to avoid “missing year” loops:
  - Resolves “this month/next month/late January/March” based on current date.
  - Infers year automatically (no numeric year required).
- **Simplified missing field logic** so dates are considered resolved when valid ISO start/end exist (no `yearConfirmed` requirement).
- **Added follow-up tone constraints** to reduce generic cheerleading and lowered temperature for follow-up questions.
- **Added UI typing indicator + delay** and **extra delay for final itinerary responses** (`replyKind` = `final` triggers 2× delay).
- **Rebranded UI** and welcome message to “Apres AI.”

## Product requirements (captured + adjusted during thread)

### MVP requirements
- Chat interface for users to discuss ski trip planning.
- Chatbot is **dynamic but ringfenced** to ski-trip planning, focused on extracting:
  1) group size + skill level range\n+  2) gear rental required (including partial rentals)\n+  3) budget preference\n+  4) travel restrictions (e.g., no flying, max drive hours)\n+  5) desired dates (supports exact dates or date windows)\n+  6) ability to collect more itinerary detail later
- Once minimum required info is obtained, run a decision process that generates **2–3 itinerary candidates**.
- Resort selection considers skill level + time of year + a snow/temperature heuristic.
  - Current heuristic: **≥ 12\" monthly snowfall** and **avg temp ≤ 50°F** (based on the repo’s small static dataset).
- Create a Google Sheets document with details (currently **stubbed**).
- Fetch best-rated nearby gear shops close to accommodation (currently **stubbed** POI enrichment).
- Prepare gear pickup details (pickup/return windows, shop hours) (stubbed).
- Identify grocery stores nearby (stubbed).
- Identify restaurants nearby (stubbed).
- Propose car rental options when flying is required; include weather-driven AWD/chains suggestions (stubbed).

### MVP scope decisions / modifications from the thread
- **LLM-only extraction**: removed all keyword/regex-based extraction. TripSpec updates come exclusively from LLM structured outputs + evidence gating.
- **Dates/year**: do **not** require users to type a numeric year; resolve month/year deterministically from the current date and user phrasing (“this month”, “March”, “late January”, etc.) without follow-ups.
- **Location input flexibility**: user can provide a resort, a region/state, or nothing (“suggest options”) and the intake flow should handle all paths.
- **Departure locations**: itinerary generation is **blocked** when travel constraints require it (e.g., no flying / max drive hours) until the user provides group “traveler pods” (e.g., “3 from SF, 3 from Sacramento”).
- **MVP bookings**: no “hard” bookings in MVP. Only “low-barrier” linkouts if/when they exist; otherwise omit.
- **Google Sheets auth**: desired UX is one-click Google account linking, then create/share a Sheet in the user’s account with appropriate permissions (not implemented yet).
- **UX timing**: final itinerary response should feel like the slowest step; implemented via a higher minimum delay for `replyKind=final`.

### Future requirements (not implemented)
- Book car rental on user’s behalf (provider integrations + payments + policy constraints).
- Make gear rental reservations on user’s behalf.
- Order grocery pickup to match arrival time on user’s behalf.
- Easy extensibility for adding new tools/nodes to the agent graph.

## Removed / changed
- Removed “July-in-California” season check (was added briefly, then fully removed).

## Notable behavior
- Itinerary generation uses local dataset + date-window candidates.
- Final response is deterministic and fast; artificial delay added client-side for UX.

## Tests
- `npm test` runs unit + API tests using the stub LLM.

## Known gaps / follow-ups
- Git remote not configured; push to `main` still pending.
- If you want cross-provider LLM portability, the `LLMClient` interface is the adapter boundary.
- Google Sheets + POI + car/gear rental integrations are stubs and need real API-backed implementations.

## How to run
```bash
npm install
npm run dev
# open http://localhost:5001
```
