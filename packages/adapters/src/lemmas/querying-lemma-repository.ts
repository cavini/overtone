import type { AudioLanguage, LemmaLookup, LemmaRepository } from '@overtone/core'

export interface LemmaRow {
  readonly form: string
  readonly lemma: string
}

/**
 * One `select form, lemma from lemmas where form = any($1)`.
 *
 * Injected rather than taking a database client, so this adapter can be
 * driven without one — and so whichever client the app ends up using stays
 * the app's business.
 */
export type LemmaQuery = (
  forms: readonly string[],
  language: AudioLanguage,
) => Promise<readonly LemmaRow[]>

/**
 * A two-hour episode has a few thousand distinct words, so this is normally
 * one query. The bound exists for the pathological case rather than the
 * expected one: an enormous array parameter makes a query plan worse, not
 * better.
 */
export const LOOKUP_BATCH_SIZE = 5_000

/**
 * Resolves lemmas from the dictionary table.
 *
 * The dictionary is 825,000 rows, so it is neither bundled into the
 * application nor loaded into memory: a use case asks for the few thousand
 * forms one episode actually used, and hands the result to the analysis as a
 * plain map. That is what lets a dictionary-backed lemmatiser sit behind an
 * analysis layer that does no I/O (ADR 0016).
 *
 * A form with no entry is left out of the result rather than mapped to
 * itself. The caller then falls back to the stemmer and records the grouping
 * as heuristic — a visible guess instead of a silent assertion.
 */
export class QueryingLemmaRepository implements LemmaRepository {
  constructor(private readonly query: LemmaQuery) {}

  async lookup(forms: readonly string[], language: AudioLanguage): Promise<LemmaLookup> {
    const wanted = new Set(forms)
    if (wanted.size === 0) return new Map()

    const distinct = [...wanted]
    const found = new Map<string, string>()

    for (let start = 0; start < distinct.length; start += LOOKUP_BATCH_SIZE) {
      const batch = distinct.slice(start, start + LOOKUP_BATCH_SIZE)

      for (const row of await this.query(batch, language)) {
        // Only what was asked for. A repository that trusted the result set
        // would let a stray row change a count.
        if (wanted.has(row.form)) found.set(row.form, row.lemma)
      }
    }

    return found
  }
}
