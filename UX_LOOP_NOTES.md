# UX Improvement Loop Notes

## Iteration 1

Issue:
- Intake often got stuck on `gear_rental` even after users provided rental count.
- Empty trip state exposed no missing-field checklist, making progression unclear.
- Final output lacked organizer-centric research links (lodging, groceries, takeout, gear, cars).
- Exported sheets were not automatically shared with editor access for anyone with the link.

Fix:
- Infer `gear.rentalRequired` from `rentalCount` and auto-confirm gear details when rental info is present.
- Initialize `TripSpec.status.missingFields` from an actual status calculation at session creation.
- Use deterministic follow-up prompts keyed to missing fields to reduce clunky off-target questions.
- Add `researchLinks` and lodging budget targets to itinerary options, render links in UI cards.
- Add a visible "Missing info" checklist block in the UI.
- Grant `anyone` `writer` permission on generated Google Sheets and include links columns in exported itinerary rows.
