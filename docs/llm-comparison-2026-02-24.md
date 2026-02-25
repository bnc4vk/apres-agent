# LLM Comparison (Mistral Free vs OpenAI SOTA)

Date: 2026-02-24

## Purpose

Evaluate whether swapping the chat/extraction + final itinerary review/rerank layer from Mistral to OpenAI improves trip-planning quality in this app.

## Profiles Compared

- `mistral_free`
- `openai_sota` (`gpt-5` via OpenAI API)

## Eval Setup

Primary command used:

```bash
EVAL_SKIP_INTERMEDIATE_REVIEW=1 \
OPENAI_HTTP_TIMEOUT_MS=20000 \
OPENAI_REVIEW_HTTP_TIMEOUT_MS=120000 \
OPENAI_REVIEW_MAX_COMPLETION_TOKENS=4000 \
OPENAI_REASONING_EFFORT=low \
EVAL_LLM_PROFILES=mistral_free,openai_sota \
npm run eval:trip
```

Notes:

- `EVAL_SKIP_INTERMEDIATE_REVIEW=1` was used to keep eval runtime practical (skips chat-loop review calls, still runs one final grounded review per scenario).
- OpenAI review path required additional compatibility work (`gpt-5` temperature handling, timeout controls, response normalization).

## Scenarios

- `co_epic_mixed`: Colorado, half Epic pass holders, mixed abilities
- `utah_ikon_group`: Utah, Ikon pass holders, group-lodging/dining constraints
- `tahoe_budget_drive`: Tahoe road trip, no passes, lower budget

## Summary Result (This Run)

### `mistral_free`

- `co_epic_mixed`: generated, but collapsed to one resort (`Steamboat`), `costDistinctCount=1`, no LLM review (`review=false`)
- `utah_ikon_group`: failed to generate candidates (`generated=false`)
- `tahoe_budget_drive`: generated, but only one resort (`Palisades Tahoe`), `costDistinctCount=1`, no LLM review (`review=false`)

### `openai_sota`

- All 3 scenarios generated successfully (`generated=true`)
- All 3 scenarios passed location compliance (`state_ok=true`)
- All 3 scenarios preserved candidate diversity (`costDistinctCount=3`)
- All 3 scenarios attached AI review/rationale (`review=true`)
- 2 of 3 scenarios were reranked by the final review step (`reviewReordered=true`)

## Key Takeaways

1. In this repo, `openai_sota` materially improved stability and candidate diversity in the evaluated scenarios.
2. The largest practical gain was not just extraction quality, but consistent completion of the final grounded review/rerank step.
3. `mistral_free` still worked in some cases, but showed instability and collapse-to-single-option behavior in this run.
4. OpenAI extraction is not perfect yet (some scenario snapshots under-extracted group/pass details), so further prompt + heuristic hardening is still needed.

## Important Caveats

- This is a small scenario set, not a full benchmark.
- Results can vary by model version/provider behavior over time.
- The OpenAI path required implementation fixes before comparison was meaningful:
  - `gpt-5` unsupported custom `temperature`
  - long-running review requests (timeouts)
  - multiple JSON response shapes for review outputs

## Recommended Default (Cost-Aware)

- Default runtime profile: `mistral_free` (cost control)
- Use `openai_sota` selectively for:
  - eval runs
  - higher-stakes itinerary generation
  - A/B quality comparisons

## Validation Update (Workflow Roadmap Session)

Commands run:

```bash
EVAL_SCENARIO_IDS=co_epic_mixed EVAL_SKIP_INTERMEDIATE_REVIEW=1 LLM_PROFILE=mistral_free npm run eval:trip
EVAL_SCENARIO_IDS=utah_ikon_group EVAL_SKIP_INTERMEDIATE_REVIEW=1 LLM_PROFILE=mistral_free npm run eval:trip
EVAL_SCENARIO_IDS=tahoe_budget_drive EVAL_SKIP_INTERMEDIATE_REVIEW=1 LLM_PROFILE=mistral_free npm run eval:trip

EVAL_SCENARIO_IDS=co_epic_mixed \
EVAL_SKIP_INTERMEDIATE_REVIEW=1 \
OPENAI_HTTP_TIMEOUT_MS=20000 \
OPENAI_REVIEW_HTTP_TIMEOUT_MS=120000 \
OPENAI_REVIEW_MAX_COMPLETION_TOKENS=4000 \
OPENAI_REASONING_EFFORT=low \
LLM_PROFILE=openai_sota \
npm run eval:trip
```

Scenarios tested:

- `co_epic_mixed` (Mistral + OpenAI spot-check)
- `utah_ikon_group` (Mistral)
- `tahoe_budget_drive` (Mistral)

`EVAL_SKIP_INTERMEDIATE_REVIEW`:

- Used (`1`) for all runs

### `mistral_free`

- All 3 targeted scenario runs generated successfully (`generated=true`)
- All 3 kept location compliance and `costDistinctCount=3`
- All 3 attached final review metadata (`review=true`)

### `openai_sota` (single spot-check)

- `co_epic_mixed` generated successfully and preserved location compliance / cost diversity
- Final grounded review did not attach in this run (`review=false`, no AI rationale on candidates)
- No quota/billing error; run completed normally

Key takeaway:

- In this session's targeted checks, `mistral_free` was stable enough for validation, while the OpenAI spot-check regressed on final review attachment (despite successful generation).

Quota/cost failures:

- None encountered in this update
