# ADR 0012 — A series has members from the first migration

**Date:** 2026-10-07 · **Status:** accepted · **Resolves:** open question Q14 (converts it from blocking to deferrable)

## Context

Open question Q14, raised by the PM and correctly flagged as blocking M1: *whose library holds the series?* The show is recorded by a group, but each friend signs in to their own account. If two hosts both upload episode 12, there are two libraries, two series and two sets of counts that will disagree.

Two possible answers:

- **Per-uploader.** `series.user_id` owns it; everyone else sees it through a share link. Simplest, no new concepts.
- **Shared series.** The show is one object that several accounts can see and add episodes to.

The PM's default was per-uploader, with shared-later if duplication becomes annoying. That is the right instinct for scope but the wrong instinct for schema, because of what "later" costs: adding shared access afterwards means a migration plus rewriting the ownership predicate in **every query and every row-level-security policy** in the app. It is the same shape of mistake as deferring `user_id`.

The stakeholder's own framing — *"the podcasts **my friends** record"* — suggests a group show, which points at shared. But we have changed direction three times already on the strength of my inferences, and I am not going to make a fourth one.

## Decision

**Put the membership table in the schema now. Do not build any sharing UI until it is asked for.**

```
series(id, owner_id, title, created_at)
series_members(series_id, user_id, role, added_at)   -- role: owner | host
```

Every read is scoped by *membership*, not by ownership:

```sql
-- the one predicate, written once, in an RLS policy
exists (select 1 from series_members m
        where m.series_id = series.id and m.user_id = auth.uid())
```

On creation, the series gets exactly one member: its owner. That is behaviourally identical to the per-uploader answer — one person, one library, no invites, no new concepts in the UI — while making the shared answer a matter of inserting a row rather than migrating a schema.

## Consequences

- **Q14 stops blocking M1.** The stakeholder can answer it at M3, or never, and neither answer costs a migration. Converting a blocking question into a deferrable one is worth more here than picking the right answer early.
- The cost today is one table and one RLS predicate. The cost of the alternative, if the group does want a shared show, is a migration plus every query and policy in the app.
- Writing the predicate against `series_members` from the first query means it is never written the other way, so there is no cutover to forget. The second-worst outcome would be *having* the table and still scoping reads by `owner_id`.
- If the answer turns out to be per-uploader forever, we carry one unused join table. That is a rounding error against the alternative.
- "Invite a host" becomes a small, self-contained story whenever it is wanted, instead of a refactor.
