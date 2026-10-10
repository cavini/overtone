# Deploying Overtone

It runs on Vercel's Hobby plan, against the Supabase and Groq free tiers. No
card, nothing to pay, and nothing runs on anybody's laptop.

## How it is wired

```
GitHub (main)  ──push──▶  Vercel  ──▶  https://<project>.vercel.app
                             │
                             ├── Supabase Postgres   counts, transcripts, allowance
                             ├── Supabase Storage    episode audio, deleted once analysed
                             └── Groq                whisper-large-v3
```

Every push to `main` deploys. `main` is therefore always green and always
shippable — that is the whole reason for the pre-push hook.

The project's **Root Directory** is `apps/web`. That one setting is what
makes a pnpm workspace work: Vercel finds `next` in the app's own
`package.json`, installs from the workspace root above it so `workspace:*`
dependencies resolve, and builds in the app directory. Deploying from the
repo root instead fails with *"No Next.js version detected"*, because the
root `package.json` has no `next` in it and never should.

`.vercelignore` is not optional. Vercel does **not** honour `.gitignore`
here, and without it the deploy uploads `audio/` — a 116 MB episode that is
both pointless and over the 100 MB per-file limit, so the whole deploy
fails. With it the upload is about 1 MB.

## Environment

Set in **Vercel → Project → Settings → Environment Variables**, for
Production *and* Preview. They are the same values as `.env.local`, which is
gitignored and never leaves the machine.

| | |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler, **port 6543** — see below |
| `MIGRATION_DATABASE_URL` | Supabase session pooler, **port 5432**. Read only by `migrate` and `db:reset`, which run from a laptop — Vercel never needs it |
| `NEXT_PUBLIC_SUPABASE_URL` | Safe in a browser |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Safe in a browser; row-level security is what protects the data |
| `SUPABASE_SECRET_KEY` | **Server only.** Bypasses row-level security. Never prefix it `NEXT_PUBLIC_` |
| `GROQ_API_KEY` | `gsk_…` from console.groq.com |
| `OVERTONE_PASSWORD` | The one the group types to get in |
| `CRON_SECRET` | Vercel sends it to the daily keep-alive as a bearer token. Any long random string; Vercel generates one if you leave it blank |

**The two database URLs are not interchangeable, and getting it wrong takes
the site down.** Port 5432 is the *session* pooler: it holds a connection for
as long as the client lives, and the free tier allows fifteen of them. Every
warm serverless instance held three, so the app ran out and answered
`EMAXCONNSESSION: max clients reached in session mode` — on a Tuesday, with
nothing deployed. Port 6543 is the *transaction* pooler, which hands the
connection back after each statement and is the right one for anything
serverless. Migrations are the exception: they take advisory locks and run
statements that the transaction pooler will not carry, so they get their own
URL on 5432 and run from a laptop, once.

## Keeping the database awake

Supabase pauses a free project after **seven idle days**, and a paused project
does not answer: the app is simply down, on a Tuesday, with nothing deployed
and nothing in the logs to explain it. The group records weekly, so one
holiday is all it takes.

`vercel.json` schedules `/api/keep-alive` once a day. It runs one `select 1`
against Postgres — reaching the web server proves nothing, because the thing
that falls asleep is the database. It sits outside the password gate, because
the scheduler has no cookie and never will, and guards itself with
`CRON_SECRET` instead.

Hobby allows a cron **once a day**, which is five times more often than
needed. Confirm it is registered under **Vercel → Project → Settings → Cron
Jobs** after the first deploy; a `vercel.json` that never deployed schedules
nothing.

## Finishing episodes with the tab closed

An episode is paced against an allowance that refills by the second, so a
two-hour one takes about an hour. Postgres drives that, not the browser
(ADR 0027) — Vercel Hobby's one-cron-a-day is no use for it.

After the first deploy, and again whenever `CRON_SECRET` or the URL changes:

```bash
APP_URL=https://overtone-five.vercel.app pnpm --filter @overtone/db schedule-advance
```

It installs `pg_cron` and `pg_net`, then schedules a minute-ly `POST` to
`/api/episodes/advance-pending`. Running it twice replaces the job rather than
adding a second one. `CRON_SECRET` is read from `.env.local` and **must match
the value set in Vercel** — if they differ, the database calls with a token
the app rejects and episodes silently stop finishing.

Check it is alive:

```sql
select jobname, schedule, active from cron.job;
select status, (response).status_code from net._http_response order by created desc limit 5;
```

**Changing the shared password** — edit it in Vercel and redeploy. Everyone's
cookie stops matching immediately, because the cookie holds a hash of the
password itself. That is the logout button.

**Leaving `OVERTONE_PASSWORD` unset removes the gate entirely.** Deliberate,
so a fresh checkout runs with no setup. Never do it in production: the thing
the gate protects is the transcription allowance, which is three episodes a
day shared by everyone.

## Database changes

Migrations are **not** run by the deploy. They are applied deliberately, from
a machine with the database URL:

```bash
pnpm --filter @overtone/db migrate
pnpm --filter @overtone/db db:inspect   # confirm: tables, RLS, policies
```

Deploy the code *after* the migration, never before — a new column the app
needs is a broken deploy if it lands second.

## What to watch

- **Supabase pauses a free project after 7 days idle.** The heartbeat table
  exists for this. If the app 500s after a quiet fortnight, the database is
  asleep; open the Supabase dashboard to wake it.
- **Storage is the ceiling that arrives first**, not money or compute. Audio
  is deleted as soon as an episode is analysed, which is what keeps 1 GB
  sufficient. If that cleanup ever stops working, storage fills in about 45
  episodes.
- **Function duration.** Hobby allows 300 s. One chunk transcribes in well
  under a minute, and waiting on the allowance returns to the caller rather
  than sleeping — precisely so a paced episode never sits in a function.

## Rolling back

Vercel keeps every deployment. Promote an earlier one from the dashboard; it
is instant and needs no rebuild. If the bad deploy also migrated the
database, roll that back first — the schema is the part that does not undo
itself.
