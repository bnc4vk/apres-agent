# Implementation Guardrails

These instructions apply to all future feature work in this repository.

## Required Verification Before Completing Feature Work

1. Run linting:
   - `npm run lint`
2. Run unit tests:
   - `npm run test:unit`
3. Run Chromium regression harness (real browser interaction):
   - `npm run test:regression`

Do not treat feature work as complete unless all three pass.

## Scope Expectations

- Prefer generalized rendering and UI behavior over brittle, custom conditional handling.
- If a regression fails, fix the underlying generalized behavior first.
- Keep new tests aligned with user-visible behavior and realistic end-to-end flows.

