# ADR 0013 — Keep recent audio, auto-purge the oldest

**Date:** 2026-10-07 · **Status:** accepted · **Resolves:** open question Q15

## Context

The PO and PM disagree, and both arguments are sound.

The **PO** says keep the audio: domain decision D10 makes provenance part of the definition of a count, and being able to *hear* the moment is what makes a number believable. For a podcast this is stronger than for a work tool — "play the bit where he says it" is most of the fun.

The **PM** says delete on success: the transcript is the durable artifact (ADR 0005), and deleting means the 1 GB free storage tier never becomes a ceiling. At ~22 MB per episode, keeping audio caps the library at about **37 episodes** — which a weekly show reaches inside a year.

Both are right, and the two extremes are both bad: deleting immediately throws away the feature that makes counts trustworthy, and keeping everything turns a storage limit into a hard wall at an arbitrary moment.

## Decision

**Keep audio for the most recent N episodes; purge the oldest automatically when storage approaches the cap. Transcripts and counts are kept forever.**

- Default N is derived from the storage budget rather than hard-coded: purge oldest-first while total audio exceeds ~80% of the tier.
- A purged episode keeps every count, every quote and every timestamp. It loses only in-app playback, and the UI says so on that episode.
- Any episode can be pinned to exempt it from purging.
- Domain decision D12 already separates *purge the audio* from *delete the recording*, so no new concepts are needed — this ADR just supplies the policy that drives the existing mechanism.

## Consequences

- Playback works where it matters most: recent episodes, which are the ones being discussed.
- Storage stops being a cliff. The library grows without limit; only playback has a horizon.
- The counts — the actual product — are never affected by storage pressure. This is the property worth protecting, and it is why the transcript and the audio have different lifetimes.
- An old episode's quote links to a timestamp you can read but not play. Honest, visible, and a reason to pin.
- Needs a purge job and a storage-usage display. The purge is one scheduled function, reusing the keep-alive cron that already exists for Supabase.
- **Reversal trigger:** if playback of old episodes turns out to matter, raising the storage tier is a paid change and therefore the stakeholder's call — but the policy is a number in config, not a redesign.
