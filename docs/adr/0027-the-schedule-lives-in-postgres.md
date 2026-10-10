# 0027 · The transcription loop runs from Postgres, not the browser

**Status** accepted
**Date** 2026-10-10
**Builds on** [0020](0020-chunk-and-pace-against-the-hourly-allowance.md) · [0021](0021-read-the-provider-s-allowance.md)

## Context

The founding sentence of this project is *"a fun free app that my friends can
use **without me having to keep my computer running all the time**."*

Chunking and pacing (ADR 0020) quietly reintroduced exactly that. An episode
is spent against a bucket refilling at two audio-seconds per wall-second, so a
two-hour episode takes about an hour of wall-clock — and the thing driving the
loop was the uploader's browser tab. Upload an episode, then leave a laptop
open for an hour.

[ADR 0010](0010-free-hosted-stack-no-worker.md) said there is no worker and no
queue, and that still holds: there is no process to run and nothing to deploy.
What was missing was only a **clock**.

Vercel Hobby has cron, and allows **one job a day**. That is the right tool for
a keep-alive ping and useless for pacing an episode through an allowance that
refills by the second.

Supabase ships `pg_cron` and `pg_net` on the free tier — checked against the
project, both available. Postgres can hold the clock.

## Decision

**`pg_cron` calls `/api/episodes/advance-pending` once a minute**, and that
endpoint moves the oldest unfinished episode one step. The browser still
splits and uploads the audio — that needs the file, so it needs the browser —
and after that the tab is free to close.

One step per call, never a loop: a function has 300 seconds and an episode
needs an hour. The schedule *is* the loop.

Scheduling is a **script**, not a migration (`pnpm --filter @overtone/db
schedule-advance`). What it installs embeds the deployment's own URL and
secret, which differ per environment and have no business in a file that is
checked in and replayed everywhere.

## The lease, and why it is not an advisory lock

Two drivers now exist — the schedule, and an open tab — and they share one
global allowance of three episodes a day. Two advances at once transcribe the
same chunk twice and pay for it twice, so everything that advances an episode
goes through one lease.

The obvious tool is `pg_try_advisory_lock`. **It does not work here, and it
fails silently.** The app speaks to Postgres through the *transaction* pooler
on port 6543, where consecutive statements can land on different backend
sessions — so a session-level lock taken by one statement is not held for the
next, and a lock held by another connection is not seen at all. Measured: a
run acquired the lock while another connection was holding it. The test was
written first and caught it immediately.

A conditional `UPDATE` on a one-row `advance_lease` table is atomic in a
single statement, so it is correct under any amount of pooling. `held_until`
doubles as crash recovery — a run that dies without releasing frees the lease
when it expires rather than wedging the schedule. The lease is 300 seconds,
matched to Vercel's own ceiling, so no run can outlive its lease.

## Consequences

- An upload survives the tab closing. The browser's own drive loop stays,
  because an open tab advances immediately rather than waiting up to a minute
  — it simply takes the same lease now, and backs off when the schedule has it.
- The endpoint sits outside the password gate: the scheduler has no cookie and
  never will. `CRON_SECRET` guards it instead, and **the schedule must be
  re-run whenever that secret changes**, or the database is calling with a
  token the app no longer accepts.
- `pg_net` records responses in `net._http_response`, which it expires on its
  own. A minute-ly job is 1,440 rows a day against a 500 MB tier.
- If the group ever uploads two episodes at once, they finish one after the
  other rather than together. That is already true of the allowance.
