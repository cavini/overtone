# ADR 0031 — Audio is freed as it is transcribed

**Date:** 2026-10-14 · **Status:** accepted · **Supersedes:** ADR 0013 · **Settles:** the storage ceiling in ADR 0011

## Context

ADR 0013 kept the audio for the most recent N episodes and purged the oldest
when the bucket filled. The policy existed to protect in-app playback: being
able to *hear* the moment is what makes a count believable (domain decision
D10), so the audio and the transcript were given different lifetimes.

Three things have happened since.

**Playback was never built.** Nothing in the app plays audio. A quote links to
a timestamp, which the reader uses to find the moment in their own copy of the
episode. Nothing has ever read a chunk's audio except the transcriber.

**The codec changed.** ADR 0013's arithmetic — ~22 MB an episode, so 1 GB
holds about 37 — assumed the 16 kHz mono Opus of ADR 0011. Encoding Opus in a
browser needs a codec; WAV needs forty-four bytes of header, so WAV is what
shipped. At 32 KB a second a 2h06m episode is **~243 MB**, and the 1 GB tier
holds **four**, not thirty-seven. The purge threshold in ADR 0013 would fire
on the second upload.

**Transcription became paced.** ADR 0020 spends the hourly allowance on
seconds of audio, so an episode's chunks drain over an hour or more. Three
uploads in a day — the daily cap — would hold ~729 MB at once while they
waited their turn, and the fourth upload would fail on a tier that, measured
against the real workload, was never going to be enough.

Measured against the live database, the episode-side cost is **~3.4 MB** for a
2h06m episode. The 500 MB tier spends ~106 MB on the fixed lemma and verb-form
dictionaries and the rest on episodes: roughly **110** of them.

## Decision

**A chunk's audio is deleted the moment its transcript is stored. No audio is
retained, no purge job exists, and nothing is pinnable.**

- `freedAudio` decides what an advance has made dead weight. A `transcribed`
  outcome frees that chunk; `ready` sweeps the episode as a backstop.
- `failed` and `waiting` free nothing. Both expect a retry and a retry needs
  its bytes — freeing there would turn a transcriber hiccup into a lost
  upload.
- `transcripts.raw_provider_payload` stays the durable artifact (ADR 0005). It
  is what re-derivation reads, so re-analysis, recounts and corrections never
  need the audio.

## Consequences

- **Storage stops being a ceiling.** The bucket holds only what is still
  untranscribed, so its high-water mark is set by one episode's remaining
  chunks rather than by the size of the library.
- **The ceiling is now the database, at ~110 episodes**, and the throughput
  limit is three episodes a day (ADR 0020). A weekly show reaches neither.
- **In-app playback is off the table**, not deferred. Building it would mean
  keeping 243 MB an episode, which the free tier cannot do for a library of
  any size. ADR 0013's reversal trigger — "if playback of old episodes turns
  out to matter" — now reads as: it needs a paid storage tier, which is the
  stakeholder's call.
- **Re-transcribing an episode means re-uploading it.** Acceptable: the only
  reason to re-transcribe is a better model, which is rare enough to pay an
  upload for, and the file is on the person's own disk.
- No purge job and no storage-usage display to build. ADR 0013 asked for both.
