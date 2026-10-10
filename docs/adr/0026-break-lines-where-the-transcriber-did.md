# 0026 · Break lines where the transcriber did, not only at punctuation

**Status** accepted
**Date** 2026-10-10
**Builds on** [0024](0024-transcribe-with-the-full-model-and-carry-context.md)

## Context

Reported from a real episode: three people's turns on one line.

> *Tipo, ai, o táxi passava na lombada Sai a cabeça da criança, flá Uma longa
> linhagem Então, talvez seja uma longa linhagem de paredeira Porque eu tô
> torcendo muito isso aí, né?*

Three speakers, one line. There is no speaker dimension in this product and
there is not going to be ([ADR 0015](0015-no-speaker-dimension.md)) — but the
*line* should still have broken.

It did not, because the only rules for breaking one were a full stop and a
forty-word cap, and the transcriber wrote no full stop anywhere in that
stretch. So it ran to the cap and swept up three turns.

Two signals were measured in the stored data:

- **Word timings overlap at the joins.** `cara?` → `Tipo,` is −380 ms,
  `flá` → `Uma` is −200 ms, `paredeira` → `Porque` is −480 ms. People talking
  over each other.
- **The transcriber reports its own segment boundaries**, and we were
  throwing them away. Ninety seconds of this show comes back as 41 of them,
  and they are turn-shaped: `Eu vou ajudar essa coitada.` / `Vai tomar no cu.`
  split cleanly across two.

Seventeen of the twenty-three word overlaps coincide with a segment boundary,
so the boundaries carry the same signal and more.

## Decision

**Persist the transcriber's segment starts and break lines at them**, as well
as at punctuation and the cap.

Only the starts, never the segment text: the text is already in `words`, and a
second copy would roughly double the largest column in the database on a
500 MB tier. They are chunk-relative like the word timings, and
`stitchBoundaries` offsets them the same way `stitchChunks` offsets words.

Two things the measurement forced:

- **A boundary is attached to the nearest word start, not compared against the
  previous word's end.** The timings overlap, so the previous word routinely
  ends *after* the next one begins and says nothing about where the break
  goes. Tolerance 300 ms — the segment pass and the word pass disagree by
  tens to hundreds of milliseconds.
- **A one- or two-word line that continues an unfinished sentence is put
  back.** The transcriber puts a boundary before a trailing `né?` as readily
  as before a new speaker, and honouring that splits one spoken line in two —
  worse than the running-together it is fixing. A short line *after* a full
  stop is left alone: that is a real turn.

Measured on real audio: well-punctuated speech comes out **unchanged**, and
the longest line in a ninety-second stretch falls from **40 words — the cap,
which is the bug — to 19.**

## Consequences

- `PIPELINE_VERSION` → 4. Every segment boundary moves, so every citation
  that points at one moves with it.
- **Episodes transcribed before this have no stored boundaries** and fall back
  to punctuation alone. They do not improve without re-transcribing, which
  costs the allowance; the column is nullable precisely so they keep reading.
- This is not speaker attribution and must not be mistaken for it. It breaks
  the line where a turn probably changed; it cannot say whose turn it is.
