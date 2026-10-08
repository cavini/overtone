# ADR 0006 — Topics are user-defined term watchlists, not machine-discovered clusters

**Date:** 2026-10-07 · **Status:** accepted

## Context
"How many times were topics mentioned" admits two readings. A topic could be **machine-discovered** (embed segments, cluster, label the clusters) or **user-defined** (a named group of terms the user cares about: *Hotdogs* = `hotdog`, `hot dog`, `hot-dog`).

Machine discovery demos beautifully and is miserable in production: the clusters are unstable between runs, the labels are vague, the user cannot correct them, and — fatally for us — a count over a fuzzy cluster cannot be verified by the person reading it.

## Decision
MVP topics are user-defined watchlists. A topic is a name, a colour, and a list of surface patterns, matched deterministically over lemmatised n-grams. Automatic discovery arrives later as a **suggestion engine** that proposes watchlists for the user to accept, edit or reject — never as the counting mechanism.

(Recorded in the domain model as decision D7, with the full argument in `../product/glossary-and-domain.md`.)

## Consequences
- Counts are exact, reproducible, and explicable: we can show the user precisely which words matched and why they grouped.
- **Trends over time remain meaningful.** This is the decisive consequence: per-recording clustering is unstable, so "cluster 3" in May is not "cluster 3" in September. A watchlist means *the hotdog topic* denotes the same thing across every recording — without which M3's trend charts and the assistant's "ever" questions are quietly meaningless.
- The user is in control. When it gets something wrong, they fix it in five seconds instead of filing a bug about a black box.
- It is testable, which machine clustering fundamentally is not at the assertion level.
- The user must tell us what they care about. That is real onboarding friction, mitigated by seeding sensible starter topics and, later, by suggestions.
- This makes the future AI assistant tractable: *"how many times did they ever discuss hotdogs"* becomes "resolve 'hotdogs' to a topic or a set of terms, then run an exact SQL aggregate." See ADR 0007.
