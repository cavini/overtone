# 0021 · Read the provider's allowance instead of modelling it

**Status** accepted
**Date** 2026-10-09
**Supersedes** the allowance model in [0020](0020-chunk-and-pace-against-the-hourly-allowance.md) (chunking itself stands)

## Context

ADR 0020 introduced chunking and pacing because an episode of this show is
longer than the whole hourly allowance. It also made an assumption nobody
checked: that the allowance is a counter zeroed once an hour. `pacing.ts`
carries that assumption in two fields, `hourResetsAt` and `dayResetsAt`, and
every throughput figure in the docs was derived from it.

[Experiment 0003](../experiments/0003-allowance-is-a-refilling-bucket.md)
measured it. The allowance is a bucket of 7 200 audio-seconds refilling at a
constant 2 audio-seconds per wall-second, and the provider reports the current
balance on **every response**:

```
x-ratelimit-limit-audio-seconds:     7200
x-ratelimit-remaining-audio-seconds: 6300
x-ratelimit-reset-audio-seconds:     7m30s
```

So we were modelling, with the wrong model, a quantity the provider hands us
for free and knows better than we do.

## Decision

**The provider is the authority on its own limits. The adapter reports what it
was told; nothing downstream guesses.**

1. A successful transcription returns an `observedAllowance` alongside the
   transcript — balance, ceiling, and time-to-full, parsed from the headers.
   A response without the headers reports `undefined`, not a fabricated
   number.
2. `AllowanceStore` records the **observed balance** when there is one, rather
   than adding up what we think we spent. Our arithmetic becomes a fallback,
   used only before the first response of a run and when headers are absent.
3. Pacing asks one question — *can the balance afford this chunk, and if not,
   how long until it can?* — answered from the refill rate rather than from a
   window expiry.

The refill rate stays a named constant derived from the measurement
(`7 200 audio-seconds per hour`) because the first chunk of a run has no
response to read yet. Every chunk after the first paces on reality.

## Why not keep modelling it

Because the model was wrong for three weeks and the suite was green the whole
time. Mirrored state that nobody reconciles against the source drifts
silently, and here the drift was a factor of ten in the headline number a user
sees — "ready in about an hour" against a real five minutes.

The provider also changes its limits without telling us. A mirrored model
needs a code change and a redeploy to track that; reading the header tracks it
for nothing.

## Why keep a store at all

The balance is per-account, not per-request, so two people uploading at once
share it. A response header tells one process what the balance was at one
moment; the store is how the other process finds out. It is a cache of an
external fact, with the external fact winning on every write.

## Consequences

- Per-episode wall clock drops from a modelled 1 h 01 m to a measured
  5–8 minutes. Every throughput number in the docs needed correcting.
- The daily cap is unchanged — ~3.8 episodes a day, ~58 days for the archive.
  It does not appear in the headers, so it stays modelled. That is now the
  only modelled limit, and it is flagged as such in the experiment.
- `AllowanceState` grows a nullable observed balance. The fixed `hourResetsAt`
  / `dayResetsAt` window fields lose their meaning for the hour and keep it
  for the day.
- One more reason the port mattered. The provider's rate-limit headers are a
  Groq detail; `observedAllowance` is not. The use case never learns what a
  header is.
