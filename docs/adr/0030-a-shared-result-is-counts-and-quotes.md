# 0030 · A shared result is counts and quotes, never the transcript

> **Superseded — the feature was removed.** The group tried sharing and did
> not want it, so the route, the token column and the whole path are gone.
> Nothing was shared at the time, so no live link was broken.
>
> This stays because the reasoning still holds if it ever comes back: a
> shared page shows counts and the quotes behind them and never the
> transcript, and the unguessable token is the permission rather than a
> row-level policy — an anonymous visitor cannot be asked which episode they
> may see, and a policy broad enough to let them look is broad enough to
> enumerate. `security.test.ts` still asserts no policy serves `anon`.

**Status** accepted
**Date** 2026-10-10
**Decides** Q17

## Context

The last thing in M4: show somebody one episode's numbers without giving them
an account, the library, or the hour of talking behind it.

## Decision

An **unguessable token in the path** is the whole permission. Sixteen random
bytes, base64url, stored on the episode — never derived from its id, because a
token anybody can recompute for an episode they are guessing at makes every
episode reachable to whoever has seen one link.

**What the holder sees is counts and the quotes behind them, and that is a
property of the shape rather than a filter.** The page renders an
`EpisodeAnalysis`, which has no transcript in it — so there is nothing to
remember to strip, and nothing a later change can forget. One episode: no
series, no library, no neighbouring episodes, nothing about the account that
shared it.

Only a `ready` episode. A half-processed one has numbers that are about to
change, and a link showing them would be showing a stranger something wrong.

Sharing is **idempotent**: pressing the button twice is what somebody does
when they lose a link, and minting a second token would leave the first
working with nothing on screen to revoke it with. Revoking clears the token
rather than remembering it as revoked — there is nothing to learn from a link
that used to work, and keeping it would risk re-issuing one already sitting in
a chat.

A revoked link and a made-up one get the same answer. Which of the two it was
is not the visitor's business.

## The bug this found

The shared page sits outside the locale tree on purpose: its address goes into
somebody's chat, and a path carrying the sharer's language arrives in the
wrong one for everybody else. The i18n middleware prefixes **anything** it is
handed, so `/s/<token>` was being redirected to `/pt/s/<token>` — a 307 into
nowhere.

**The same was true of `/auth/callback`**, whose address is in an email and in
the provider's redirect allow-list. Every magic link would have landed on a
redirect instead of a session. Found by opening a share link with no cookie
and reading the status code, not by any test.

## Consequences

- `/s/*` and `/auth/*` bypass the locale middleware entirely.
- The shared page is `noindex`: a link is given out, never found.
- The only identifier on the page is the episode's own, which the holder of
  the link is already looking at.
- A shared episode renders in Portuguese. The show is in Portuguese and the
  quotes are never translated — they are what was said.
