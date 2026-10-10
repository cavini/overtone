# Deploying Overtone

It runs on Vercel's Hobby plan, against the Supabase and Groq free tiers. No
card, nothing to pay, and nothing runs on anybody's laptop.

## How it is wired

```
GitHub (main)  ──push──▶  Vercel  ──▶  https://<project>.vercel.app
                             │
                             ├── Supabase Postgres   counts, transcripts, allowance
                             ├── Supabase Storage    episode audio, deleted once analysed
                             └── Groq                whisper-large-v3-turbo
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
