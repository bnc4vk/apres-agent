# Route Matrix

This document tracks current API usage while migrating from legacy session-centric endpoints to trip-centric endpoints.

## Frontend usage (current)

| Frontend action | Current endpoint | Target endpoint |
| --- | --- | --- |
| Session bootstrap | `GET /api/session` | keep (session-scoped) |
| Chat turn | `POST /api/chat` | keep (session-scoped) |
| New chat | `POST /api/session/new` | keep (session-scoped) |
| Create trip record | `POST /api/trips` | `POST /api/trips` |
| Patch trip spec | `PATCH /api/trips/:tripId/spec` | `PATCH /api/trips/:tripId/spec` |
| Refresh options | `POST /api/trips/:tripId/options/refresh` | `POST /api/trips/:tripId/options/refresh` |
| Expand itinerary | `POST /api/itinerary/expand` | `POST /api/trips/:tripId/itineraries/:itineraryId/expand` |
| Export sheets | `POST /api/export/sheets` or `POST /api/trips/:tripId/export/sheets` | `POST /api/trips/:tripId/export/sheets` |
| Bootstrap Splitwise | `POST /api/trips/:tripId/integrations/splitwise/bootstrap` | same |
| Bootstrap chat | `POST /api/trips/:tripId/integrations/chat/bootstrap` | same |

## Legacy routes to retire after frontend migration

- `POST /api/itinerary/expand`
- `POST /api/export/sheets`
- Alias endpoint `POST /api/trips/:tripId/integrations/splitwise/connect`
