# ADR 0036 — The language is heard, not declared

**Date:** 2026-11-02 · **Status:** accepted
**Supersedes** [0022](0022-the-language-is-chosen-per-episode.md), in part

## Context

ADR 0022 made the language a property of the episode, settled at upload and
never revisited. That was right, and it is kept. What it got wrong was where
the value came from: the interface language. Switching the reading language
also chose what the next upload would be transcribed and analysed as, which
is a consequence large enough that a notice had to appear on the following
page to explain it.

The stakeholder found that notice and said what it looks like from outside:

> is it based on the language selected on the UI? because if that is the
> case, thats stupid. we should auto select the language based on the audio
> file

They are right, and the reasoning in 0022 shows how it happened. That ADR
separated two things — "a finished episode's counts must never move" and "the
language can never be chosen" — kept the first and dropped the second. It
then reached for the nearest available signal for the choice. The interface
language is not a signal about audio; it is a fact about whoever happens to
be logged in.

### The fact that decides the design

Asked where to listen, the stakeholder added the constraint that makes this
more than a one-line change:

> we have to skip the intro because its a music in english

**The show opens on music with English lyrics.** So the obvious
implementation — hand the first chunk to the detector, or probe the opening
thirty seconds — answers "English" for every episode this group has ever
recorded. Confidently, and correctly about the audio it was given.

That also means something about the archive that is not about detection at
all, recorded here because it was found while looking: **nothing skips the
intro today**, so on every episode already stored, the intro's English lyrics
were transcribed under `language: pt` and counted into `term_counts` as
Portuguese words. See *What is not fixed*.

## Decision

**The language is heard from three half-minute windows of the episode's own
audio, settled once before any chunk is cut, and recorded on the episode.**

### Three windows, from fractions of the duration

`planLanguageProbes(durationMs)` returns windows centred at 25%, 50% and 75%.
Two properties matter and neither is incidental:

- **Never the opening, and never the end.** Fractions rather than an offset
  past a fixed intro length, so there is no constant here to revise when the
  intro is re-cut. At the show's own length the windows land about half an
  hour apart, far inside the conversation.
- **Three rather than one.** The answer is not a label. It picks the
  stop-word list, the stemmer and the half of the lemma dictionary every
  count is computed from (ADR 0023) — so a wrong answer reports `the` and
  `of` as the most-said words of a Portuguese episode, plausibly, with
  nothing on screen to say so. One window is one mid-roll sting or one
  read-aloud English quote away from deciding the episode; three make that a
  minority.

Thirty seconds each because that is exactly what the detector reads: Whisper
identifies the language from a single 30-second window, so a shorter probe is
padded and a longer one is charged for in full and then ignored past the first
half minute.

The cost is **90 audio-seconds against a 7,200-second hour** — 1.25%, on a
pipeline that already waits five to eight minutes per episode for the bucket
to refill. It is not a consideration.

### A strict majority, and a refusal when there isn't one

`settleLanguage` takes the majority of the probes that answered. A probe that
failed is not a vote. An even split settles nothing, and that is the
behaviour rather than a gap: an evenly split result is either a detection not
worth acting on or a genuinely bilingual recording, and a bilingual recording
has no correct answer here because only one pack can be chosen for the whole
episode.

Undecided **refuses the upload**. The tempting fallback is the interface
language, which is the thing being removed. Refusing costs 90 seconds of
probe audio and stores nothing; guessing costs a full set of counts that look
right. A language with no pack behind it — Spanish — is refused by name,
because "undecided" is a poor way to say "this recording is in Spanish".

### The ordering, which is the same discipline as the seams

The probes are uploaded, listened to, and the answer written to
`episodes.language` **before a single chunk is cut**. Every chunk states the
episode's language when it is sent, so a chunk sent earlier would be
transcribed as whatever the row still said — and the column's default is
`pt`. This is the rule `chunk_starts_ms` already follows for the same reason,
and the window where the default stands cannot be observed, because no chunk
of that episode exists yet.

The probe audio is deleted whichever way it goes. Three thirty-second WAVs
are about 3 MB, and left behind per episode they would be paid for out of the
same 1 GB tier the chunks are racing through.

### The port asks instead of stating

`TranscriptionRequest.language` becomes optional: omitted means detect, and a
probe is the only request in the app that omits it. Two things were wrong on
the way through and are fixed here rather than separately, because the change
exposed both:

- **The answer was being thrown away.** Both the fake and the Groq adapter
  echoed `request.language` back as the transcript's language, so the field
  recorded what we had assumed rather than anything heard.
- **`Transcript.language` was a `string`.** The provider answers in full
  English names — the recorded fixture in this repo says `"portuguese"` — and
  that string travelling onward would match neither stop-word list nor either
  half of the lemma dictionary, while `languagePack` served Portuguese for
  anything it did not recognise. It is now an `AudioLanguage`, narrowed in
  the adapter because that is the only layer that knows the provider's
  vocabulary, and an unmappable answer is a refusal rather than a default.

The contract suite is where this is pinned, so the fake cannot promise a
detection the real adapter does not perform. Both implementations failed the
new case before either was changed, which is the suite doing its job.

## Consequences

- The locale switcher switches the interface and nothing else. The notice,
  its `sessionStorage` flag and the label that dismissed it are deleted.
- `startEpisode` no longer takes a language. The coupling is gone from the
  signature, not merely unused.
- ADR 0022's invariant survives untouched, and so does the US-046 test:
  switching the interface still changes every string and no count, because
  each episode records what it was transcribed as.
- Two message codes: `AUDIO_LANGUAGE_UNSUPPORTED{heard}` and
  `AUDIO_LANGUAGE_UNDECIDED`. Both are emitted, so neither joins the
  `NOT_YET_EMITTED` list.
- `PIPELINE_VERSION` is **not** bumped. No analysis output changes — the same
  packs run on the same transcripts. What changed is which pack a *new*
  episode gets, and existing rows keep the truth about themselves.

## What is thin, and what is not fixed

Being specific about this is the point of writing it down.

**The stop-word check is a tripwire, not a verifier.** `languageFromStopWords`
scores a transcript against both stop-word lists, which is free — it reads
text already paid for. It was introduced here as a second opinion on the
detection and it cannot be one: the transcriber chooses the words, so a clean
transcription into the wrong language comes back agreeing with the mistake and
this agrees with it too. What it catches is the louder failure, where the
function words contradict the language the text was transcribed in, which is
what a mismatched transcription produces when it leaks the language actually
being spoken. **The genuinely independent signal is the transcriber's own
per-segment confidence, which collapses when it is forced into a language the
audio is not in — and it sits unread in the payload we already store
(US-012).** That is the next cheap thing worth building, and it is not built.

**Only the response shape is verified, not the behaviour.** The adapter is
driven by a recorded `verbose_json` body, and no test may call Groq. So the
mapping `"portuguese"` → `pt` is pinned against a real recorded response, but
*that the endpoint detects at all when the field is omitted* is taken from the
OpenAI-compatible contract rather than observed. One manual upload confirms
it; until then this is the one unverified assumption in the change.

**The five shared stop words.** `a`, `as`, `do`, `no` and `me` are function
words in both languages — measured, the only five of 279 and 255 — and are
discarded, because counted naively a hit on one is evidence of both at once.
That leaves 274 and 250 discriminating, which is why two overlapping lists
can still tell the languages apart.

**The intro's lyrics are still counted.** Nothing trims the opening before
analysis, so every episode's counts include its English intro, transcribed
under whatever the episode's language is. Detection now steps around the
intro; the counts do not. Fixing it changes analysis output and therefore
bumps `PIPELINE_VERSION` and re-analyses the archive, which is why it is not
in this change.

**An undecided episode has no manual override.** Refusing is the safe
default and nothing wrong is stored, but a reader whose episode will not
settle has nowhere to go. The stronger version of this is a nullable
`episodes.language`, where `null` means "not yet heard" and `advanceEpisode`
refuses to transcribe without one — a property enforced by the schema instead
of by call ordering. It needs a migration and the ordering already holds, so
it was not taken.
