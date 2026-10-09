# 0003 · The hourly allowance refills continuously

**Date** 2026-10-09
**Why** ADR 0020 assumed the hourly limit was a fixed window that resets on
the hour. Every throughput number in the docs — and the pacing code — was
built on that assumption. It is wrong.

## What was measured

Two consecutive transcriptions of the same 15-minute slice (900 audio-seconds)
against `whisper-large-v3-turbo` on the free tier, reading the response
headers rather than the body.

| | `limit` | `remaining` | `reset` |
|---|---|---|---|
| after 1st (900 s spent) | 7200 | 6300 | `7m30s` |
| after 2nd (1800 s spent) | 7200 | 5473 | `14m23.5s` |

## What it means

The reset header is not a time of day. It is **how long until the balance is
full again**, and it matches the deficit exactly:

```
observation 1:  7200 − 6300 =  900   and   450.0 s × 2 =  900   ✓
observation 2:  7200 − 5473 = 1727   and   863.5 s × 2 = 1727   ✓
```

So the allowance is a bucket of 7 200 audio-seconds that refills at a constant
**2 audio-seconds per wall-second**, continuously — not a counter that is
zeroed once an hour.

The second observation also rules out the fixed-window reading on its own. A
window would have shown `remaining = 5400` after 1 800 seconds of audio. It
showed 5 473: the extra 73 is the bucket refilling during the ~36 seconds the
first request took.

## Consequence

**Per-episode wall clock was overstated by an order of magnitude.** A 2 h 06 m
episode is 7 591 audio-seconds in 7 chunks. The first six (7 200 s) drain a
full bucket, but transcription is not instantaneous — ~30 s per chunk — and the
bucket refills throughout. The 391-second tail needs ~196 s of refill at
worst, less whatever accrued while the other six were in flight.

```
                     ADR 0020 assumed    measured
per episode              1 h 01 m         ~5–8 min
```

**The daily cap is unchanged and still binds.** 28 800 audio-seconds a day is
~3.8 episodes, and the 219-episode archive is still ~58 days. The hourly limit
shapes a single episode; the daily limit shapes the backlog.

Note the daily cap does **not** appear in the response headers — only the
hourly `audio-seconds` and `requests` pairs do. It is documented but
unobserved, so it stays modelled rather than measured.

## What follows

1. Chunking stays. The reason in ADR 0020 holds: a 7 591-second episode cannot
   pass as one request against a 7 200-second ceiling, whatever the file size.
2. Pacing must model a **refill rate**, not a window that expires.
3. Better still, pacing should stop guessing. The provider reports its own
   remaining balance on every response, which is ground truth and free. See
   ADR 0021.
