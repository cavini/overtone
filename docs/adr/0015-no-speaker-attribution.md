# ADR 0015 — One edited file per episode; speaker attribution is cut

**Date:** 2026-10-08 · **Status:** accepted · **Supersedes:** ADR 0011 decision 2 (energy attribution)

## Context

ADR 0011 built an elegant answer to "who talks most" without diarisation: transcribe the mixed master once, then attribute each word to whichever host's individual track was loudest. It required per-host audio.

The stakeholder: *"they would only upload the final edited file."*

There is one file per episode, already edited. No per-host tracks exist, so there is no energy signal to attribute against — and there is no free transcription service that does speaker diarisation.

## Decision

**"Who talks most" is removed from the product.** Not deferred behind a flag, not a later lane — removed, because nothing in the free stack can produce it from a single mixed file.

Deleted: `host_tracks`, the energy-envelope computation, the 3 dB dominance threshold, `unknown` attribution, per-host counts, the `GROUP BY host_id` queries, and domain decision D13.

Kept: everything about *what* was said. Term frequency, running-joke counts, cross-episode trends, drill-down to quotes, playback. The product's actual promise is untouched — only the "who" dimension goes.

## A consequence worth saying out loud

The audio is **post-edit**. Retakes, tangents and some filler have been cut before it reaches us.

So counts describe **the published episode — what listeners actually heard** — not the raw conversation. For a podcast that is arguably the *more* meaningful measurement: "we said it 312 times on the show" is the fact an audience would recognise. But it should be stated rather than assumed, and it has one honest implication: filler-word and pace metrics measure **the edit**, not anyone's speech habits. We will not present them as the latter.

## Consequences

- Real scope reduction: a table, a browser-side DSP step, an attribution algorithm, a threshold rule, an invariant test and several stories all disappear. The upload flow simplifies to one file.
- Chunking is unaffected — a single 2-hour file still splits on silence and transcribes in parallel (ADR 0011 decision 1 stands in full).
- The `Series`-scoped `hosts` concept loses its purpose and goes with it.
- **Reversal trigger:** if the group ever starts keeping per-host tracks, ADR 0011's energy attribution was the right design and can be restored — the reasoning is on the record and nothing built since contradicts it. That is the only thing that would bring it back; a paid diarisation service would not, because it is confidently wrong on crosstalk and crosstalk is most of a podcast.
- Note what this did *not* cost. The decision touched one optional dimension of the data model and no part of the counting engine. That separation was not luck — it is the dependency rule in ADR 0016.
