# Overtone — Personas

Overtone is a **free hobby app for a small group of friends who record a show together, in Brazilian Portuguese.** Two personas, both real, both in the first release. Everyone else is explicitly not who this is for.

| Rank | Persona | Verdict |
|---|---|---|
| **1 — MVP** | **P1 Rafa — the host who uploads** | Records weekly-ish with 2 friends. Owns the episodes, runs the analysis, posts the results in the group chat. Every story is written for Rafa. |
| **2 — MVP** | **P2 Mel — the co-host who gets the link** | Signs in with a magic link, has her own Library, uploads occasionally. Mostly she *opens what Rafa shares*, on her phone. She is why share links and magic-link auth are features and not plumbing. |

**Not who this is for:** the engineering manager with recurring meetings, the qualitative researcher who needs defensible methods, the sales lead with 80 calls a month. All three need integrations, compliance posture, or accuracy guarantees that a free hobby app cannot and should not carry. Previous drafts of this doc were built around the manager; that was wrong.

---

## P1 — Rafa Duarte · co-host and de facto producer (MVP persona)

| Field | Detail |
|---|---|
| Context | Three friends — Rafa, Mel and Davi — one show **recorded in Brazilian Portuguese**, ~16 episodes so far, **100–120 minutes each**: they talk for two hours and barely notice. Records remotely, edits in Audacity, and what leaves his laptop is **one final mixed file per episode** — the published edit. Audience: roughly 40 people, several of whom are their parents. |
| Job to be done | "Tell me what we actually keep talking about across the whole show." |
| Success measured by | (a) Can point at a number that is funny — *"a gente falou 'né' 312 vezes nessa temporada"*; (b) can see a running bit's arc across episodes, not just one; (c) can paste a link in the group chat that renders something worth screenshotting. |
| Top frustration | He already *knows* the show's recurring bits by name — "a parada do hotdog", "a conspiração do Davi" — and has no way to count them. Generic word clouds tell him the show says "tipo" a lot, which he also already knows. |
| Budget | Zero. Not "small" — **zero**. Will abandon the product at the word "upgrade". |
| Constraints he lives with | No budget, no team, no deadline, no obligation. He does this for fun after work. Anything that takes more than one evening to figure out does not get figured out. |
| Accuracy tolerance | Loose, *if* a number is clickable back to the moment someone said it. He will happily laugh at a mis-transcription. He will not forgive a number he cannot check. |
| Deal-breakers | Paying. Signing up for a vendor. Leaving a laptop running overnight. **A two-hour episode being rejected for being two hours long.** |
| Vocabulary he uses | "piada interna", "a parada de sempre", "a gente sempre acaba falando de", "a temporada". Not: "topic model", "n-gram", "lematização". |

## P2 — Mel Okafor · co-host, mostly a reader (MVP persona)

| Field | Detail |
|---|---|
| Context | Records on a USB mic; Rafa edits the three of them into the one file that gets published. Opens Overtone maybe twice a month, usually from a link in the group chat, usually on a phone. Has her own Library with four episodes she uploaded herself. |
| Job to be done | "Show me the thing Rafa is laughing about without making me learn an app." |
| Success measured by | A shared stats page loads on a phone, is readable in 10 seconds, and does not demand a sign-in before she can see it. |
| Top frustration | Tools that insist she create an account and build a workspace before showing her anything. |
| Why she is MVP, not deferred | She is the entire reason the stakeholder chose "log in, plus share links". Without her, share links are an optimisation; with her, they are the distribution mechanism for the whole app. |

---

## Invariants (true for both — treat as product constraints)

1. **Every number must be auditable.** A count with no path to the moment it was said is worthless, and it is the only thing standing between "fun" and "made up".
2. **The Series, not the episode, is the unit of value.** One analysed episode is a toy. The product is the arc across episodes.
3. **It must cost nothing to run and nothing to use.** Any feature whose honest acceptance criteria include a bill is out of scope by definition.
4. **Nobody wants a transcript.** The deliverable is a number, the quotes behind it, and a link worth posting — and **settled (stakeholder): that link shows counts and quotes, never the full transcript.**
5. **The numbers describe the published episode.** The upload is the final edit, so every count is about what listeners heard, not about the raw conversation (D15). Say it; never imply otherwise.
6. **Both of them read Portuguese; the English interface is for whoever they show it to.** The interface is pt-BR or English, switchable and persisted; the **audio and the analysis are always pt-BR** (D16). A count must never move because a reader changed the interface language — Mel on a bus in English and Rafa at his desk in Portuguese must see the same number, formatted for each of them (`1.234` and `1,234`).
7. **The Series starts at episode 1.** No back catalogue is imported — the stakeholder chose new episodes only — so for the first weeks the product has one or two episodes to work with. Invariant 2 still holds, which is exactly why the single-episode state has to be honest rather than empty: *"this is your first episode, there is nothing to compare yet."*
