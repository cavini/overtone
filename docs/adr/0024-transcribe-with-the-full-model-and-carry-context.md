# 0024 · Transcribe with the full model, and carry context across chunks

**Status** accepted
**Date** 2026-10-10
**Supersedes** the model choice in [0010](0010-free-hosted-stack-no-worker.md)
(the stack itself stands)

## Context

ADR 0010 chose `whisper-large-v3-turbo` for speed, on the reasoning that a
fast model is what lets transcription happen inside a request with no queue.
That reasoning stopped being true at ADR 0020: an episode of this show is
longer than the whole hourly allowance, so it is cut into chunks and paced
against a bucket that refills at two audio-seconds per wall-second. **What an
episode costs in wall-clock is set by the allowance, not by the model.**

Meanwhile the group, who know what was said, can hear the transcript getting
it wrong.

## Decision

Three changes, each measured in
[experiment 0004](../experiments/0004-transcription-quality-levers.md):

1. **`whisper-large-v3`, not `-turbo`.** Both have the same free allowance —
   7 200 audio-seconds an hour, 2 000 requests a day — in **separate buckets**,
   so the full model is free. On a real slice, turbo rendered a plain sentence
   as *Mas tem marucu!* where the full model heard *Vai tomar no cu.* The extra
   600 ms per 90 seconds of audio is invisible behind the pacing.

2. **Each chunk is prompted with the last 200 characters of the one before
   it.** A chunk transcribed cold begins mid-conversation knowing nothing
   about it, and measurably loses words at the join — a whole clause, in the
   case measured. One extra indexed read per chunk, via a new
   `ChunkStore.transcript(episodeId, index)`; the existing `transcripts()`
   reads the entire episode and exists for stitching.

3. **`temperature: 0`, explicitly.** Already the provider's default. Sampling
   is a way of guessing, and a count built on a guess is worse than a gap.

## What this rules out

**Never prompt with a glossary of names.** It is the obvious thing to try and
it makes the output worse: the model copies the shape of what it is handed, so
a list of names came back as a list, with `P.` speaker labels stamped through
the speech. If vocabulary biasing is ever revisited it must be natural prose in
the show's own register, and it must be A/B'd on real audio before it ships.

## Consequences

- Transcription quality improves at every chunk boundary, which on a two-hour
  episode is nine or ten joins.
- The first chunk sets the punctuation and casing style that later chunks
  inherit through the prompt. Watch for a badly-formatted opening chunk
  propagating; if it becomes a problem the fix is to normalise the tail before
  passing it, not to drop the prompt.
- `ChunkStore` grew a method, so every implementation and its contract suite
  grew with it. The contract caught the fake and the real adapter at once.
