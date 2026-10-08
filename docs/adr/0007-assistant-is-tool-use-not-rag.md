# ADR 0007 — The AI assistant is tool use over our analytics API, not RAG

**Date:** 2026-10-07 · **Status:** accepted (design committed now, implementation deferred)

## Context
The deferred feature is a chatbot answering questions like *"how many times did they ever discuss hotdogs?"* across the whole library. The default 2020s answer is retrieval-augmented generation: chunk the transcripts, embed them, retrieve top-k, let the model answer.

**RAG cannot answer this question.** Top-k retrieval returns a sample, so the model counts the sample and reports a number that is confidently, invisibly wrong. For a product whose entire promise is an accurate count, a plausible wrong number is the worst possible failure — worse than an error, because nobody notices it.

## Decision
The assistant is a tool-using agent over the analytics functions the UI already uses. Claude does language; SQL does arithmetic.

The product-side domain model names the mechanism precisely (decision D11, "one count engine, two front-ends"): a **`Query`** is a first-class stored object — `{ terms | topics, recordingFilter, dateRange, speakerFilter, groupBy, metric }`. The dashboard builds one per view. The assistant's entire job is *natural language → `Query`*, plus prose over the segments that come back. It never computes a number itself. Epic E10 in the backlog builds this `Query` foundation during the MVP, which is what makes the assistant cheap later.

- Model `claude-opus-5`, `thinking: {type: "adaptive"}`, `output_config: {effort: "medium"}`.
- The loop is the Anthropic SDK's Tool Runner (`client.beta.messages.tool_runner` with `betaZodTool`), so our existing Zod contracts become the tool schemas directly.
- Tools: `count_mentions`, `compare_terms`, `search_utterances`, `list_recordings`, `speaker_breakdown`, `trend_over_time` — each one compiles its arguments into a `Query` and runs it through the same engine the dashboard uses. No tool contains its own SQL.
- Citations are capped transcript retrieval (≤20 segments) used **only** to quote; never to count.
- Prompt caching on the stable prefix (system prompt + tool definitions) keeps multi-turn sessions cheap.
- `pgvector` handles only the fuzzy half: *"did they talk about food?"* → find semantically near terms in the user's own vocabulary → hand those **exact** terms to `count_mentions`. **Semantic search proposes; SQL counts.**
- Behind a feature flag, off by default, with per-user rate limiting.

## Consequences
- Numbers in chat are the same numbers in the dashboard, computed by the same code. There is one source of truth, so the two can never disagree — the alternative guarantees they eventually do, which is unrecoverable for a measurement product.
- Cost stays flat as the library grows: ~\$0.03 median per question against aggregates (est.), versus ~\$2+ and rising for context stuffing. Scaling the wrong way with library size would be exactly backwards for a product about "ever".
- Every answer is auditable — it decomposes into tool calls with concrete arguments we can log and replay.
- Testable: with a scripted `AssistantModel` fake we assert that a given question produces the expected tool call with the expected arguments, without touching the network.
- Hallucinated *numbers* are structurally impossible; the model can still phrase things badly, which is a prompt problem rather than a correctness one.
- Requires the analytics layer to be clean, parameterised functions from the start. This is the real constraint this ADR places on the MVP — and the reason the feature can be deferred without accruing debt.
