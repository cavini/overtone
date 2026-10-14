# Experiment 0001 — the pt-BR recall pilot

**Run:** 2026-10-09 · **Cost:** nothing · **Verdict:** the product works, with one design assumption now proven load-bearing

The gate the roadmap put before every other piece of work: does Portuguese
transcription actually recognise the words this show cares about? Risk R1 was
the only item on the register that could have ended the project, and the only
way to settle it was to run it.

## Method

21 seconds of Brazilian Portuguese, synthesised with the macOS `Luciana`
voice at 16 kHz mono, through Groq's `whisper-large-v3-turbo` with
`language=pt` and word-level timestamps. The text was a realistic cold open
naming two running jokes.

Synthesised speech, not a real recording — that is the pilot's main
limitation and the reason to repeat it on a genuine episode.

## What came back

Transcription was effectively instant and the shape was exactly as assumed:
58 words with start and end times, 6 segments, `duration` present. The
`words` array the published documentation does not describe is real, and the
strict schema that validates it needed no change.

Recall on ordinary speech was excellent. The two findings are about the
unusual words — which is where the risk always was.

### `guardachuva` was heard as `Guadachuva`

Both times. Consistently.

The topic `Guardachuva`, with patterns `guardachuva` and `guarda chuva`,
counted **zero** mentions. The same topic with `guadachuva` added as an
alias counted **two**, each with a timestamp.

This is R1 materialising precisely as predicted, and it is also the
clearest possible vindication of ADR 0006: a running joke is a *set* of
spellings the group maintains, not a single string. A topic defined as one
word would have silently reported zero and been believed. The alias
mechanism absorbed a mishearing nobody could have anticipated.

**The consistency is what makes this survivable.** A mishearing that varies
run to run would be hopeless; one that is stable is just another spelling.

### Spoken numbers came back as digits

`doze` became `12`, `sete` became `7`. Consistent with domain decision D2,
which keeps numbers as the transcriber wrote them. Worth knowing before
anyone defines a topic containing a number.

## What this changes

Nothing structural. Three things are now evidence rather than argument:

1. **Aliases are not a nicety.** They are the mechanism that makes counting
   survive transcription error, and the UI must make adding one obvious —
   ideally by noticing an unmatched near-miss and offering it.
2. **A topic reporting zero needs to look like a question, not an answer.**
   `Guardachuva: 0` was *wrong*, and nothing on the page would have said so.
   A zero on a topic whose words appear nowhere in the transcript deserves a
   prompt to check the spelling.
3. The pilot should be repeated on a real episode before M2. Synthetic speech
   is clean; three friends talking over each other is not.

## Still open

Whether a real recording does better or worse than a synthesised voice on the
in-joke words. That needs ten minutes of an actual episode, and it is the one
measurement left that could still change the plan.
