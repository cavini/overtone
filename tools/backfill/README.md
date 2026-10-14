# Back-catalogue backfill

Walks a show's own RSS feed and gets old episodes into the app, oldest first,
one at a time, over days. Resumable: stop it whenever, re-run it whenever.

It is a **client of the running app**, not a second way in. It signs in with
the shared password and calls the same three endpoints the upload form calls,
in the same order, and it runs the browser's own splitter over the audio. There
is no path here that writes to the database.

## Before you start

**1. ffmpeg.** The only thing this needs that the repo does not install. The
browser decodes audio with `AudioContext`; out here there is no browser.

```bash
brew install ffmpeg          # macOS
sudo apt install ffmpeg      # Debian/Ubuntu
```

On an older macOS, Homebrew may have no bottle for part of ffmpeg's dependency
tree and **compile it from source** — eighty-odd formulae, tens of minutes,
with no output until it finishes. It is a one-time cost. `ffmpeg -version`
answering is the signal that it is done.

The tool checks for it before it downloads anything, and says this if it is
missing:

```
ffmpeg is not installed, and this tool decodes the audio with it.
Install it with: brew install ffmpeg
```

**2. `curl`.** Ships with macOS and every Linux. Used instead of `fetch`
because podcast CDNs answer `fetch` with a 404 and `curl` with the redirect
they should — identical URL, identical method. See `download-audio.ts`.

**3. `.env.local` at the repo root** needs:

| | |
|---|---|
| `OVERTONE_FEED_URL` | the show's feed. **A secret** — a private feed carries its token in the path |
| `OVERTONE_FEED_SHOW` | which programme in that feed to walk when the command line does not say. Quote it: `OVERTONE_FEED_SHOW="My Show"` |
| `OVERTONE_PASSWORD` | the shared password, the same one the app is running with |
| `OVERTONE_BASE_URL` | optional; defaults to `http://localhost:3000` |
| `OVERTONE_LOCALE` | optional; `pt` or `en`, the language the audio is transcribed as |

**4. The app has to be running**, because this talks to it over HTTP:

```bash
pnpm dev     # in another terminal
```

Point `OVERTONE_BASE_URL` at the deployment instead if you would rather not run
one locally. Either way the episodes land in the same Supabase project, because
that is what `DATABASE_URL` says.

## Running it

```bash
pnpm backfill                     # the 10 oldest of OVERTONE_FEED_SHOW
pnpm backfill "My Show" 3         # three of a named one
pnpm backfill --help
```

The show name is matched against the **start of each feed title**,
case-insensitively, because one feed carries several of the collective's
programmes and they are numbered independently — nine numbers in the real feed
are claimed by more than one show.

## What it does, per episode

1. Downloads the enclosure to `audio/backfill/<show>-<nnn>.mp3` (gitignored).
2. Fingerprints it (SHA-256) and decodes it with ffmpeg to 16 kHz mono.
3. `POST /api/episodes/start` with the duration **measured from the samples**,
   the fingerprint, and the filename.
4. Settles the chunk seams into the nearest gaps between words, and
   `POST /api/episodes/boundaries` with where they landed — **before any audio
   is uploaded.**
5. `PUT`s each chunk's WAV straight to its signed storage URL.
6. Deletes the local file.
7. Waits until the app has finished with that episode, then takes the next.

It never transcribes anything. `pg_cron` advances the oldest unfinished episode
every minute and pauses itself when the day's allowance is spent
([ADR 0027](../../docs/adr/0027-the-schedule-lives-in-postgres.md)).

### The filename is the metadata

`/api/episodes/start` takes a filename where it looks like it takes a title: the
server reads the programme and the episode number out of it, files the episode
under that programme, and looks the published title up in the feed by that
number. Nothing else carries either fact.

So the name is `my-show-007.mp3` — kebab-case, number last, zero-padded,
and **never a `#`**. A `#` makes the last word `#007`, which is not a number, so
the episode would be filed under no programme at all and numbered one past
whatever was uploaded last. Feed titles are written `My Show #007`, so
the character is right there in the source string.

## Why it takes days, and why that is correct

Uploading is as fast as your connection. Transcribing is not: the free
allowance is spent in **seconds of audio**, refilling at two audio-seconds per
wall-second, with a daily cap that holds about **three of this show's episodes**
([ADR 0020](../../docs/adr/0020-chunking-is-mandatory-for-the-rate-limit.md)).

Chunk audio is freed as each chunk is transcribed
([ADR 0031](../../docs/adr/0031-audio-is-freed-as-it-is-transcribed.md)), so the
1 GB storage tier only ever holds what is still untranscribed — which is only
true if uploads are paced to match the draining. Uploading the archive as fast
as it downloads would put a few hundred megabytes an episode into that gigabyte.

Hence one episode in flight at a time. Before starting one, the tool asks
`/api/episodes/list` whether anything is still `uploaded`, `transcribing` or
`analyzing`, and waits a minute at a time until nothing is.

> `/api/episodes/pending` is **not** the check, though it is used for the
> progress line: it only reports an episode that is *transcribing*, so one that
> has been uploaded and not yet picked up by the schedule — exactly what this
> tool leaves behind — is invisible to it.

Leave it running in a terminal, or start it again tomorrow. It makes no
difference.

## Re-running is always safe

The tool keeps **no state of its own** — no progress file, no cursor. Everything
it needs to decide is asked fresh, because a run that spans days will be
interrupted:

- `/api/episodes/list` before anything is downloaded, matched by published
  title, or by episode number within the programme for an episode that was
  filed under the title read from its filename.
- `alreadyHave` from `/api/episodes/start`, which matches the **fingerprint of
  the audio**. That is the authority, and it holds even if an episode was
  renamed or re-released. The cost is one download to find out.

## Reading the log

```
02:31:07  My Show: 201 published, 2 already here, 3 to do now
02:31:07  #3 My Show #003 — downloading
02:33:48  #3 My Show #003 — uploading 13 chunk(s)
02:34:02  chunk 1 of 13 sent
...
02:41:55  #3 My Show #003 — uploaded; the schedule will transcribe it
02:42:55  waiting — My Show #003, chunk 2 of 13
```

## When something goes wrong

| What you see | What it means |
|---|---|
| `ffmpeg is not installed` | `brew install ffmpeg` |
| `would not accept the password` | `OVERTONE_PASSWORD` does not match what the app is running with. A wrong password and an unset one answer identically on purpose, so the tool proves the session with one authenticated request rather than guessing |
| `ECONNREFUSED` | the app is not running, or `OVERTONE_BASE_URL` is wrong |
| `chunk N upload failed: 403` | a signed upload URL expired mid-upload — they last fifteen minutes. The tool drops the half-uploaded episode and starts that one again, once. If a chunk had already been transcribed it says so: that audio gets paid for twice |
| `the app still holds the half-uploaded episode` | the clean-up did not take. Delete that episode in the app and re-run — an episode missing chunks can never finish, and it blocks both the schedule and this tool |
| `3 episodes failed in a row` | it stops rather than marching through the catalogue repeating one error |

An episode left in `audio/backfill/` is a failure worth looking at. A successful
one is always deleted.

## The code

| | |
|---|---|
| `backfill.ts` | the loop: which episodes, waiting for room, retry, clean-up |
| `overtone-api.ts` | the app's HTTP API as a program sees it |
| `decode-with-ffmpeg.ts` | ffmpeg to 16 kHz mono `Float32Array` |
| `download-audio.ts`, `audio-digest.ts`, `audio-file-name.ts` | the file, its fingerprint, its name |
| `spawn-program.ts` | the only module that touches `child_process` |
| `borrowed-from-the-app.ts` | the one file naming what is imported from `apps/web` |
| `main.ts` | the composition root — the only module that reads the world |

**The splitting is the app's own.** `splitAndUpload` takes its decoder as an
argument: the browser passes `decodeInBrowser` (`AudioContext`), this tool
passes an ffmpeg one, and both run the same seam-settling and the same
boundary-reporting order. That ordering is load-bearing — record the boundaries
after the upload, or swallow a failure to record them, and the server offsets by
the planned boundaries while the bytes follow different ones: every timestamp
after a seam wrong, every number still plausible. It is the code this repo calls
its highest-risk, so there is exactly one copy of it.

Everything with a decision in it takes what it needs as an argument, so the
tests touch no network, no feed, no disk and no ffmpeg — while still running the
real splitter:

```bash
pnpm --filter @overtone/backfill test:unit
```
