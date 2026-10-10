# 0004 · What actually improves the transcription

**Date** 2026-10-10
**Why** The group knows what was said on these episodes and can hear the
transcript getting it wrong. Before changing anything, measure which of the
available levers is worth pulling — the free tier rules out most of them, and
one of the obvious ones turns out to make things worse.

## What was measured

A 90-second slice of a real episode (`slice-30-45.m4a`, from 2:00), decoded to
the same uncompressed 16 kHz mono WAV the app already uploads, sent four ways.

### The models carry the same allowance

Probed with one second of silence against each, reading the response headers:

| model | `limit-audio-seconds` | `limit-requests` |
|---|---|---|
| `whisper-large-v3-turbo` | 7 200 | 2 000 |
| `whisper-large-v3` | 7 200 | 2 000 |

Each went 7 200 → 7 199 **independently**, so the two have separate buckets.
The faster model buys nothing: pacing is governed by the bucket refilling at
two audio-seconds per wall-second, never by how long a request takes.

### `large-v3` hears the show better

| model | wall time | the same sentence |
|---|---|---|
| `whisper-large-v3-turbo` | 1 433 ms | *Mas tem marucu!* |
| `whisper-large-v3` | 2 027 ms | *Vai tomar no cu.* |

Turbo is a distilled decoder, and on this audio it rendered a plain, extremely
common sentence as nonsense. Six hundred milliseconds on ninety seconds of
audio is not a cost worth that.

### A glossary prompt makes it worse

Whisper accepts an initial prompt. The obvious use is a list of the show's
recurring names — *Dex, Decaão, Kogos, Bolsonaro, Major Olímpio, Salles* —
on the theory that it biases decoding toward them.

It does not do that. The model copies the **shape** of whatever it is given,
so a list came back as a list:

> P. Não, ela agora é membro da Itália, ela tá tentando falar… P. Mas tem
> marucu! P. Então acho que dá esse tchan.

Speaker labels stamped through the speech, invented out of the prompt's
punctuation. On `large-v3` the damage was subtler and still real: *dá esse
tchan* became *dá esse chance*, and an *uma* was dropped. **Rejected.**

### The previous chunk's tail makes it better

The legitimate use of the prompt is continuity. Two adjacent 60-second chunks,
the second transcribed twice — once cold, once prompted with the last 200
characters of the first:

**Cold** — what the app did until now:

> Não dizendo que precisa ser pau no cu Igual eles são Eu já estava esperando
> Mas isso é um pouquinho Mas então aprenda O básico ali

**Prompted with what came before:**

> não dizendo que precisa ser pau no cu igual eles são, eles são um pouquinho
> não vou te mentir não, eu já estava esperando mas eles são um pouquinho mas
> então aprenda o básico ali

The cold run **dropped a clause outright** — *eles são um pouquinho não vou te
mentir não* — and garbled what it kept into capitalised fragments. This is not
a formatting difference; it is words that were said and did not get counted,
at every chunk boundary in every episode.

## What was not worth changing

- **The audio.** Already uncompressed 16 kHz mono PCM, which is exactly what
  Whisper downsamples everything to. There is nothing above it to give.
- **`temperature`.** The provider already defaults to 0. Set explicitly now,
  because a default is not a decision.

## Conclusion

Switch to `whisper-large-v3`, prompt each chunk with the tail of the one
before it, and never with a glossary. See
[ADR 0024](../adr/0024-transcribe-with-the-full-model-and-carry-context.md).
