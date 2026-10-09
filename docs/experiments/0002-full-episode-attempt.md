# Experiment 0002 — a real episode, end to end

**Run:** 2026-10-09 · **Cost:** nothing · **Verdict:** Portuguese recall is good; the free tier's hourly limit is the real constraint and it had been missed

Experiment 0001 ran on a synthesised voice and ended with one open question:
does a real recording, with three people talking over each other, do better
or worse? This is that measurement. It answered the question and surfaced a
constraint that three rounds of planning had not.

## The episode

An ordinary episode of the show: **2 h 06 m 31 s**, 116 MB as a 128 kbps
stereo MP3, three hosts, Brazilian Portuguese throughout.

## Encoding behaved as designed

| | |
|---|---|
| Transcoded with `afconvert` to 16 kHz mono AAC at 24 kbps | 17 seconds |
| Predicted size | 21.72 MB |
| Actual size | **22.58 MB** |
| Groq's file cap | 25 MB |

The single-file premise held: a two-hour episode really does fit one upload.

Two corrections fell out:

- **The estimate was 4% optimistic.** Asked for 24 kbps, the encoder produced
  24.9 once container overhead and its own variability were counted. The
  planner now includes a measured 6% factor, which predicts 23.0 MB where
  reality was 22.58 — conservative, which is the right direction, because the
  failure an optimistic estimate causes happens at the end of a long upload.
- **`ffmpeg` was never needed.** macOS ships `afconvert`, which did the whole
  transcode in 17 seconds.

## The upload was refused, and not for its size

```
HTTP 413
seconds of audio per hour (ASPH): Limit 7200, Requested 7591
```

The free tier allows **7 200 audio-seconds per hour**. The episode is **7 591
seconds**. It is 391 seconds longer than the entire hourly allowance, so it
can never be transcribed as one request however small the file gets.

The total also exceeds one hour's budget, so a single episode of this show
cannot be processed inside one hour at all.

This is recorded as **ADR 0020**, which reinstates the chunking that ADR 0018
had deleted — and adds the part ADR 0011 never anticipated: the chunks must be
**paced** against the hourly allowance, not run in parallel, because the
allowance is spent in seconds of audio and parallelism does not reduce that.

## Portuguese recall, on real speech

A 15-minute slice from the middle of the episode, where the conversation is
unscripted and overlapping:

| | |
|---|---|
| Words transcribed | 2,702 |
| Speaking rate | 180 words per minute |
| Distinct terms | 435 |
| Distinct spellings the dictionary knew | 321 of 679 |
| Terms grouped from several spellings | 62 |
| Grouped by the stemmer rather than the dictionary | 9 |

**Recall is good, and the dictionary earns its place on real speech.** Five
forms of *querer* collapsed into one term, four of *falar*, four of *ficar*,
and `garrafinha`/`garrafinhas` folded correctly into `garrafa` — a diminutive
no stemming rule of ours would have caught.

The three most frequent countable words were the discourse markers `assim`
(39), `né` (28) and `tipo` (28), in fifteen minutes. Keeping those countable
rather than filtering them away as noise was the right call: at that rate they
are a real finding about how this group talks, and exactly the sort of number
the show's hosts would argue about.

No mishearing as dramatic as experiment 0001's `hotdog` → `Outdog` appeared in
the slice, but the sample did not include a known in-joke. That check still
wants a list of expected terms written down **before** the transcript is read.

## What changed as a result

1. **ADR 0020** — chunking reinstated and paced. The daily ceiling is three of
   this show's episodes, not four, and the 219-episode archive is 462
   audio-hours — about 58 days of continuous processing.
2. **The size estimate now includes measured encoder overhead.**
3. **Episode downloads use `curl`.** The podcast host's CDN answers Node's
   `fetch` with a 404 and `curl` with the redirect it should — same URL, same
   method, and no combination of headers changes it.

## Still open

A recall check against a written-down list of the group's own in-jokes. That
is the last measurement that could change the plan, and it needs the hosts to
name the terms first.
