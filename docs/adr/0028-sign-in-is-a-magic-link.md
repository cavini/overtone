# 0028 · Sign-in is a magic link, and a library belongs to a person

**Status** accepted, **amended 2026-10-15**: the ordinary way in is an email
and a password. A link costs an email every time and the free tier rations
them — which this ADR already noted as the reason the session lasts a month.
What survives is everything below about the port, the contract, and checking a
token locally; the link itself is now the password-recovery path. The shared
password this replaced is gone rather than dormant.
**Date** 2026-10-10
**Replaces** the shared password in [0018](0018-one-shared-password.md)

## Context

Access was one password in an environment variable, and the roadmap always
called that an M0 stopgap. It cannot tell two people apart, so there was one
library that everybody shared, owned by a fixed id belonging to nobody.

## Decision

**Magic links through Supabase Auth**, behind an `IdentityProvider` port with
a fake and a contract suite — the whole test suite signs in through the fake,
so a fake more forgiving than the real thing would make every test that needs
an account pass for a reason production does not share. The contract pins the
two that matter: a token works **once**, and the same address is always the
same person.

REST rather than the SDK, like the blob store and the transcriber. Four
endpoints, one request each, and the injected `fetch` is the seam the tests
need.

### A token is checked locally

`whoIs` verifies the access token against the project's published ES256 key
rather than asking the service. The alternative is a network round trip on
**every** request, and the transcript reader polls every five seconds — one
open tab would be twelve sign-in checks a minute against a free tier.

The algorithm is **pinned, not read from the header**. Believing the header is
the classic JWT hole: `alg: none`, or a symmetric algorithm verified against a
public key everyone can read. Tested against both, plus a forged signature and
an edited payload.

The cost is that a token stays good until it expires even if the session ended
elsewhere. Sessions last an hour.

### The scope is derived, never passed

`seriesFor(userId)` replaces the shared series. **Every query that reads or
writes an episode hangs off the id it returns** — so a route that forgets to
scope has nothing to scope *to*. There is no filter to remember.

Anything addressed by an id the caller chose is checked separately with
`mustOwnEpisode`, because a UUID in a URL is not a permission. Search takes
the series as a **required argument**: it reads every stored segment there is,
so an unscoped search is one person reading another's transcripts.

A caller who is not entitled gets **404, not 403**. Whether somebody else's
episode exists is not their business either.

### The middleware is a redirect, not the lock

It checks only that a session cookie is *present*, because verifying one costs
a signature check and it runs on nearly every request. A forged cookie gets
past it and then has nothing to read. The enforcement is `requireUser()` plus
the derived scope.

### The invitation is what protects the allowance

The password was never about privacy — the group's episodes are not secret
from each other. It was about the **allowance**: three episodes a day, shared.
Sign-in anybody can complete is that budget open to the internet.

`OVERTONE_INVITED` is the list. Somebody not on it is told their link was sent
and nothing is sent, because "you are not invited" confirms both that the list
exists and that they found a real deployment. Unset means no list, so a fresh
checkout still runs with no setup — the same bargain the password made.

## Not switched on yet, and that is a decision

**The shared password is the access model today.** Magic-link sign-in is
built, tested and deployed, and it is dormant.

Turning it on needs an email provider — Supabase's built-in sender only
reliably reaches the project's own owner, so friends would never receive a
link — and that means signing up with Resend or Brevo and, for anything but
your own address, proving you own a domain. That is a real afternoon, for a
group of four who are happy sharing one password.

It is also worth saying plainly: **"one login everybody shares" and "magic
link" are different things.** A magic link arrives in *somebody's* inbox, and
whoever owns that inbox is the account. One shared account reached by magic
link would mean one shared inbox. The password is the honest shape for what
the group actually wants right now.

So: the password path below is **not transitional scaffolding to be tidied
away**. It is the live access model until somebody decides per-person
libraries are worth an email provider. Everything behind it — per-user
scoping, ownership checks, the isolation suite — is already in place and will
simply start applying the day sign-in is switched on.

## The cutover, when it comes

Whoever holds the password is treated as the owner of the library from before
accounts, so the group's episodes keep reading exactly as they did. It is
**off unless `OVERTONE_PASSWORD` is set**: unset the variable and the whole
path disappears.

When sign-in is switched on: set the Supabase Site URL and redirect, add an
SMTP provider, sign in once by link, run `claim-library` to move the existing
episodes to that account, and only then unset the password.

## Consequences

- **Three dashboard settings have to be made by hand** and sign-in is broken
  until they are: Site URL, `/auth/callback` in the redirect allow-list, and
  custom SMTP. The built-in sender is rate-limited to a couple of messages an
  hour and is meant for development.
- **The episodes uploaded under the password are orphaned** until
  `pnpm --filter @overtone/db claim-library you@example.com` is run. A script
  and not an automatic adoption on first sign-in: that would hand the group's
  episodes to whoever signed in first.
- The scheduled transcription step has no signed-in user, so it reads an
  episode's running jokes through the episode's own series (ADR 0027).
