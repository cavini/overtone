# ADR 0017 — Bilingual UI, and no user-facing text below the presenter

**Date:** 2026-10-08 · **Status:** accepted · **Consequence of:** ADR 0016 · **Resolves:** the interface-language question

## Context

The interface must be switchable between **Brazilian Portuguese and English**. The audio is always pt-BR.

The obvious reading is "add a translation library." That is the small half. The large half is that **a layered architecture cannot have a use case that knows what language the reader wants** — and right now the acceptance criteria are full of assertions like:

```gherkin
And I see the error "Unsupported file type .docx. Overtone accepts .mp3, .m4a, …"
```

A test can no longer assert that sentence, because the sentence has two forms and neither of them belongs anywhere near the domain. i18n is therefore not a feature bolted to the edge of this app; it is a constraint on where strings are permitted to exist.

## Decision

**`next-intl`** carries the mechanism — the App Router standard, with Server Component support and locale routing. Two catalogues: `messages/pt.json`, `messages/en.json`.

And one hard architectural rule:

> **No user-facing text exists below the presenter layer.** The domain, the use cases and the analysis engine deal in typed **message codes with parameters**. Text is produced only in the presenter, from the catalogue, for the reader's locale.

So `failure_reason` stops being a sentence and becomes a code:

```ts
type MessageCode =
  | 'UNSUPPORTED_FORMAT'      // { extension, accepted[] }
  | 'EPISODE_TOO_LONG'        // { minutes, maxMinutes }
  | 'ALLOWANCE_EXHAUSTED'     // { retryAfterHours }
  | 'TRANSCRIPTION_FAILED'    // { chunkIndex }
  | 'LANGUAGE_MISMATCH'       // { detected }
  …
```

and the episode row carries `failure_code` plus `failure_params jsonb` instead of a message. The full code table lives in `../product/backlog.md`, owned by the PO, and becomes a TypeScript union — so an unhandled code is a **compile error**, and a code missing from either catalogue is a **test failure**.

This is ADR 0016's boundary-DTO rule turning out to be load-bearing rather than tidy. A use case that returned `"This file is too large"` would have been fine in a monolingual app and is simply wrong here.

## The trap: interface language is not audio language

These are different things and conflating them is the obvious bug.

The audio is **always Brazilian Portuguese**. The analysis pipeline is **always `language: "pt"`** — tokenising, clitic splitting, the lemma dictionary, the stop-word list, all pt-BR, always (ADR 0014). Someone reading the interface in English is still analysing Portuguese speech.

Which gives us the invariant worth a test:

> **A count must never change because the interface language changed.** Switch locale, re-render, assert every number is byte-identical.

## Numbers are the product, so formatting is correctness

pt-BR writes `1.234,56` and `08/10/2026`. English writes `1,234.56` and `10/8/2026`.

For most apps that is polish. Here the entire output is numbers, so a count rendered with the wrong thousands separator is a **defect**, not a cosmetic issue — `1.234` mentions reads as "one point two three four" to an English reader and as "one thousand two hundred thirty-four" to a Brazilian one. All formatting goes through `next-intl`'s locale-aware formatters; raw `toLocaleString()` calls and hand-rolled separators are banned.

## Decision — when it lands

The **mechanism** ships in the first increment that renders anything: next-intl wired, the locale switcher present, both catalogues existing, even if each holds four strings. Most strings arrive later, but the rule has to exist before the first string does.

The reason is cost asymmetry. Adding i18n on day one is a config file and a discipline. Retrofitting it means hunting every hard-coded string in an app that already has hundreds, and the ones you miss are found by users. This is the same reasoning that put `user_id` in the first migration (ADR 0012): the cheap-now/expensive-later asymmetry decides the timing, not the feature's priority.

## Consequences

- Every string exists in two places forever. That is the honest recurring cost, and it is the price of the stakeholder's choice.
- Error messages become **better**, not just translatable. A code with typed parameters forces us to decide exactly what the user is told and what data it needs — the vague message is no longer possible to write by accident.
- Testing gets easier at the domain layer: assert `code === 'EPISODE_TOO_LONG'` with its params, rather than string-matching prose that a copy edit would break.
- An unhandled message code fails the build; a code missing from either catalogue fails a test. Neither can reach a user.
- A third language later would be one more catalogue and zero code changes — not a goal, but a consequence worth having.
- The analysis pipeline is unaffected, by design. It never saw a user-facing string in the first place.
