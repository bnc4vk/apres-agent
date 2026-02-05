# Apres AI (MVP Skeleton)

This repo contains a working MVP skeleton for Apres AI, a ski-trip planning webapp:
- Chat intake that builds a structured TripSpec
- Deterministic gating logic for missing info
- Itinerary generation (2–3 options)
- Stubbed POI enrichment and Google Sheets export
- Test suite with unit + E2E conversation transcript coverage

## Quick start
```bash
npm install
npm run dev
```
Open `http://localhost:5001`.

## Tests
```bash
npm test
```

## Notes
- Chat intake uses a LangGraph state machine + Mistral SDK structured outputs. Configure via `.env`.
- POI and Google Sheets integrations are stubbed. Replace `src/core/poi.ts` and `src/core/sheets.ts` with API-backed implementations.
- Resort dataset is intentionally small (Tahoe + Colorado). Expand `src/core/resorts.ts` as launch zones grow.
