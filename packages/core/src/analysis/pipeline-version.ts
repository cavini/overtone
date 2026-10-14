/**
 * Bumped whenever this pipeline would produce different numbers for the same
 * transcript — a tokeniser change, a new stemming rule, a different stop-word
 * policy.
 *
 * Stored with every analysis so that a count can be traced to the code that
 * produced it, and so re-analysis knows what is stale. Forgetting to bump it
 * leaves old numbers sitting next to new ones with no way to tell them apart.
 *
 * **2** — the pipeline takes the episode's language (ADR 0023). Portuguese
 * numbers are unchanged, and that is not a reason to leave this at 1: version
 * 1 described one pipeline, and version 2 describes two that share a shape.
 * A Portuguese episode and an English one both claiming version 1 would make
 * the number meaningless in exactly the case it exists for.
 *
 * **3** — Portuguese words are no longer folded into their other gender.
 * `menina` used to be counted as `menino`, `música` as `músico`, `irmã` as
 * `irmão`; now each stands for itself. On a measured episode this moves 32
 * terms, so every count from before it is a different number.
 *
 * **4** — lines break where the transcriber said a run of speech started,
 * not only at punctuation. Three people's turns used to run onto one line
 * whenever no full stop was written between them, so every segment boundary
 * — and every citation that points at one — moves.
 *
 * **5** — a verb lemma is refused for a word no morphology knows as a verb
 * form. `gato` was counted as `gatar`, `bebê` as `beber`, `esperança` as
 * `esperançar`. Nineteen terms move on a measured episode and every real
 * verb form is untouched.
 *
 * **6** — a chunk's words are held to its own stretch of the episode. The
 * transcriber overran the audio it was handed on a real episode, giving the
 * last 5 of 1557 words timestamps 24 seconds past the end — far enough to
 * land inside the next chunk, so two chunks claimed the same moment and a
 * citation could point at the wrong one. Counts are unchanged; every
 * timestamp near a seam can move.
 */
export const PIPELINE_VERSION = 6
