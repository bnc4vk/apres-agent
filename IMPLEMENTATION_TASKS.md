# Implementation Task List

## Milestone 1 — Supabase persistence + session cookie
- [x] Add persistence modules (Supabase + memory).
- [x] Add signed session cookie utility.
- [x] Add app config module for envs.
- [x] Bugs found in milestone 1 testing (none).

## Milestone 2 — API uses persistence
- [x] Replace in-memory sessions with Supabase store.
- [x] `GET /api/session` returns prior conversation state.
- [x] `POST /api/chat` persists messages + TripSpec.
- [x] Bugs found in milestone 2 testing (none).

## Milestone 3 — UI renders history + actions
- [x] Load and render message history on init.
- [x] Add export-to-sheets CTA when ready.
- [x] Add expand option CTA (post-itinerary).
- [x] Bugs found in milestone 3 testing (none).

## Milestone 4 — Google OAuth + Sheets export
- [x] OAuth start + callback endpoints.
- [x] Store encrypted refresh tokens.
- [x] Export endpoint creates + populates sheet.
- [x] Bugs found in milestone 4 testing (fixed: decision package sheet creation crash).

## Milestone 5 — POI integration + itinerary extras
- [x] Replace POI stub with Google Places.
- [x] Update decision summary copy + car rental notes.
- [x] Add itinerary expansion endpoint.
- [x] Bugs found in milestone 5 testing (none).

## Milestone 6 — Tests + full pass
- [x] Update tests to use memory persistence.
- [x] Run test suite.
- [x] Bugs found in milestone 6 testing (none).
