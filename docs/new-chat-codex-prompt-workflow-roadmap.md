# New Chat Prompt (Codex) - Full Roadmap Execution with Cost-Efficient LLM Escalation

Paste the prompt below into a new Codex chat.

---

You are working in the Apres AI repo at `/Users/bencohen/Desktop/apres-agent`.

I want you to execute the workflow/coordination/repeatability/integrations roadmap in a single long-running session (it can take a long time), while using a cost-efficient model strategy:

- Always try `mistral_free` first.
- If Mistral repeatedly fails to meet implementation validation criteria, pivot to `openai_sota` for validation/evals and (if necessary) targeted generation/testing.
- You may mark a feature implementation complete if it meets the acceptance criteria with `openai_sota`, even if `mistral_free` remains weaker.
- If OpenAI calls start failing due to quota/cost/billing limits, stop the implementation effort and report that as the blocker.

## First, load context from these files

1. `/Users/bencohen/Desktop/apres-agent/docs/roadmap-workflow-coordination.md`
2. `/Users/bencohen/Desktop/apres-agent/docs/llm-comparison-2026-02-24.md`
3. `/Users/bencohen/Desktop/apres-agent/README.md`
4. `/Users/bencohen/Desktop/apres-agent/src/services/decisionReviewService.ts`
5. `/Users/bencohen/Desktop/apres-agent/src/llm/openai.ts`
6. `/Users/bencohen/Desktop/apres-agent/src/llm/candidateReview.ts`
7. `/Users/bencohen/Desktop/apres-agent/test/evalTripPlanning.ts`

## Important current context

- Major itinerary quality fixes are already implemented (cost differentiation, pass-aware ranking, believable lodging sourcing/links, transparent cost breakdowns, improved decision matrix, better link UX).
- LLM profile switching is implemented via `LLM_PROFILE` with `mistral_free`, `mistral_paid`, `openai_sota`, `stub`.
- Final grounded LLM rerank/review layer exists and is attached to decision package + itinerary cards.
- OpenAI compatibility fixes for `gpt-5` review calls are already in place (temperature handling, timeout/retry behavior, response normalization).
- `.env` is intentionally set to `LLM_PROFILE=mistral_free` for cost control. Preserve that default unless explicitly testing with OpenAI.

## Primary objective (single chat)

Implement **all phases** in `/Users/bencohen/Desktop/apres-agent/docs/roadmap-workflow-coordination.md` in one session, in pragmatic increments:

1. Phase 1: Workflow Spine
2. Phase 2: Coordination Layer
3. Phase 3: Repeatability + Auditability
4. Phase 4: Integration Hardening
5. Phase 5: Operational Intelligence

Do not stop after Phase 1. Continue through all phases unless blocked by timeouts/quota/cost failures (especially OpenAI quota failures).

## Cost-efficient model usage policy (must follow)

### Default

- Keep `.env` default as `LLM_PROFILE=mistral_free`.
- Do routine implementation and local testing under default settings.

### Mistral-first validation

For each major milestone (or at least once per phase):

1. Run build/tests.
2. Run browser validation in Chromium.
3. Run a targeted eval or scenario check using `mistral_free` first.

### Escalate to OpenAI when Mistral fails repeatedly

Pivot to `openai_sota` if **any** of the following occurs:

- 2 consecutive Mistral validation failures for the same feature acceptance path, or
- 3 total Mistral failures in a phase where the failure is due to LLM reasoning/extraction/review quality (not deterministic code bugs), or
- Mistral produces unstable results that prevent clear acceptance determination.

When escalating:

- Prefer **targeted** OpenAI runs (single scenario / focused browser flow) instead of full evals first.
- Use environment overrides in the command (do not permanently change `.env` to OpenAI).
- After OpenAI validation, return to `mistral_free` by default for continued implementation.

### OpenAI quota/cost failure handling (hard stop)

If OpenAI requests fail due to quota, billing, or cost limits:

- Stop the implementation session.
- Report exactly where progress stopped.
- Summarize completed phases/tasks and remaining work.

## Required logging of model switches + performance comparisons

Every time you switch from `mistral_free` to `openai_sota` (or back for validation), record it.

### Where to record it

- Append to `/Users/bencohen/Desktop/apres-agent/docs/llm-comparison-2026-02-24.md`

### What to record (same style/format as existing comparison doc)

Add a new dated subsection for each meaningful comparison/update that includes:

- command(s) run
- scenario(s) tested
- whether `EVAL_SKIP_INTERMEDIATE_REVIEW` was used
- outcome summary for `mistral_free`
- outcome summary for `openai_sota` (if run)
- key takeaway
- any quota/cost failures encountered

If you add a new comparison section, keep the same concise markdown style as the existing file.

## Execution requirements

- Make real code changes (not just planning).
- Run `npm run build` and `npm test` regularly.
- Use Chromium for real UI interaction testing after meaningful UI changes.
- Preserve and avoid regressing the existing UI/itinerary quality improvements.
- Keep deterministic pricing/inventory/tool outputs as the source of truth.
- Use LLMs only for extraction/rerank/explanations and coordination drafting, not price/inventory truth.
- Prefer backward-compatible changes for existing sessions; if migration is needed, implement a minimal compatibility path.

## Acceptance policy (important)

For each roadmap phase, explicitly state whether the phase is:

- `Complete (Mistral + OpenAI)`
- `Complete (OpenAI only)`
- `Partial`
- `Blocked (quota/cost)`

You are allowed to mark a phase complete if acceptance criteria are satisfied with `openai_sota` even when `mistral_free` is insufficient.

## Final deliverables expected in this single chat

1. Implemented code for all feasible phases.
2. Browser-tested flows in Chromium.
3. Updated comparison documentation with recorded model switch(es) and outcomes.
4. Clear phase-by-phase completion status.
5. If stopped by OpenAI quota/cost: explicit blocker report and remaining backlog.

## Suggested working cadence (use this)

For each phase:

1. Inspect current code paths and identify minimal architecture changes.
2. Implement backend/domain changes.
3. Implement UI changes.
4. Run build/tests.
5. Chromium test the relevant flow.
6. Validate with `mistral_free`.
7. If needed, escalate to `openai_sota` under the rules above.
8. Record the comparison/switch result in the comparison doc.
9. Move to the next phase.

## Useful commands (cost-aware)

### Build/tests

```bash
npm run build
npm test
```

### Mistral-first eval (default)

```bash
EVAL_SKIP_INTERMEDIATE_REVIEW=1 LLM_PROFILE=mistral_free npm run eval:trip
```

### Targeted one-scenario OpenAI eval (preferred before full OpenAI eval)

```bash
EVAL_SCENARIO_IDS=co_epic_mixed \
EVAL_SKIP_INTERMEDIATE_REVIEW=1 \
OPENAI_HTTP_TIMEOUT_MS=20000 \
OPENAI_REVIEW_HTTP_TIMEOUT_MS=120000 \
OPENAI_REVIEW_MAX_COMPLETION_TOKENS=4000 \
OPENAI_REASONING_EFFORT=low \
LLM_PROFILE=openai_sota \
npm run eval:trip
```

### Full side-by-side comparison (use sparingly)

```bash
EVAL_SKIP_INTERMEDIATE_REVIEW=1 \
OPENAI_HTTP_TIMEOUT_MS=20000 \
OPENAI_REVIEW_HTTP_TIMEOUT_MS=120000 \
OPENAI_REVIEW_MAX_COMPLETION_TOKENS=4000 \
OPENAI_REASONING_EFFORT=low \
EVAL_LLM_PROFILES=mistral_free,openai_sota \
npm run eval:trip
```

## Start now

Begin by loading the context files, summarizing the current architecture relevant to Phase 1-5, then produce a short execution plan and start implementing immediately.

---

