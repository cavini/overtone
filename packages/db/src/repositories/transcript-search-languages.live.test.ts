// US-047 · ADR 0023
//
// Searching in both languages, against real Postgres. Nothing else can tell
// you what a text-search configuration actually does: every number in these
// tests was measured against the archive rather than reasoned about, and
// several of them contradicted the reasoning.
//
// Skipped without DATABASE_URL, because CI has no database.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { DrizzleTranscriptSearch } from './drizzle-transcript-search.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('searching in both languages', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} })
  const search = new DrizzleTranscriptSearch(drizzle(client))

  /** How many segments one configuration alone would match. */
  const inOneLanguage = async (configuration: 'portuguese' | 'english', query: string) => {
    const rows = await client`
      select count(*)::int as n from segments s
       where to_tsvector(${client.unsafe(`'${configuration}'`)}, s.text)
          @@ plainto_tsquery(${client.unsafe(`'${configuration}'`)}, ${query})`
    return rows[0]?.n ?? 0
  }

  describe('searching in both languages', () => {
    it('still finds a word that was actually said in Portuguese', async () => {
      expect((await search.search('cachorro', 50)).length).toBeGreaterThan(0)
    })

    /*
     * The loanword case this exists for.
     *
     * The archive says "podcast" and a reader types the English plural. The
     * Portuguese stemmer leaves `podcasts` as `podcasts`, so the two never
     * meet; the English one reduces both to `podcast`. Measured on the
     * archive: 0 segments through `portuguese`, 10 through `english`.
     */
    it('finds an English loanword the Portuguese stemmer cannot reach', async () => {
      expect(await inOneLanguage('portuguese', 'podcasts')).toBe(0)

      const found = await search.search('podcasts', 50)

      expect(found.length).toBeGreaterThan(0)
      expect(found.some((match) => /podcast/iu.test(match.text))).toBe(true)
    })

    /*
     * And it earns its place on Portuguese, which was the surprise.
     *
     * Snowball only strips a suffix inside the word's RV region, and a short
     * word has none — so `to_tsvector('portuguese', 'anos')` is `'anos'`,
     * not `'ano'`, and a search for `ano` missed every one of the 133
     * segments that say `anos`. The English stemmer strips the plural. The
     * same holds for `dias`, `pais` and `bets`.
     */
    it('finds a short Portuguese plural that Portuguese stemming leaves joined', async () => {
      const throughPortuguese = await inOneLanguage('portuguese', 'ano')
      const found = await search.search('ano', 300)

      expect(found.length).toBeGreaterThan(throughPortuguese)
      expect(found.some((match) => /anos/iu.test(match.text))).toBe(true)
    })

    /*
     * The gate, and why it is not optional.
     *
     * `que` parses to nothing in Portuguese — it is a stop word — and to a
     * lexeme in English, which holds it for 2,172 of the archive's 6,952
     * segments. Without the gate, adding the English half would have turned
     * "no results" into a third of every episode ever recorded. `não` is
     * 1,544 and `ele` is 931.
     */
    it.each(['que', 'não', 'ele', 'para', 'depois'])(
      'returns nothing for the Portuguese stop word %s',
      async (word) => {
        expect(await inOneLanguage('english', word)).toBeGreaterThan(0)
        expect(await search.search(word, 50)).toEqual([])
      },
    )

    // Symmetrically. `the` is a content word to the Portuguese configuration,
    // so on an English episode it would match every segment.
    it.each(['the', 'and', 'that'])('returns nothing for the English stop word %s', async (word) => {
      expect(await search.search(word, 50)).toEqual([])
    })

    /*
     * The invariant the whole design hangs on.
     *
     * Adding a second configuration must not change the answer to a question
     * asked in the first. Checked against the archive's own most-said terms
     * rather than invented words: for 292 of the top 300, the English half
     * contributes nothing at all, and where it does contribute the rows are
     * real — `anos` for `ano`, `dias` for `dia`.
     */
    it.each(['cachorro', 'falar', 'casa', 'comer', 'trabalho', 'gente', 'coisa'])(
      'never loses a segment a Portuguese search already found: %s',
      async (word) => {
        const throughPortuguese = await inOneLanguage('portuguese', word)
        const found = await search.search(word, 1_000)

        expect(found.length).toBeGreaterThanOrEqual(throughPortuguese)
      },
    )

    /*
     * Both indexes, or the archive gets scanned twice over.
     *
     * A sequential scan here would still be correct and would get slower
     * every week. `BitmapOr` is Postgres combining the two GIN indexes, which
     * is the whole reason this is two expression indexes rather than one
     * concatenated `tsvector` — and it also keeps each half's positions
     * intact, which concatenation would shift.
     */
    it('uses both indexes rather than reading every segment', async () => {
      const [plan] = await client`
        explain (format json)
        select s.id from segments s
         where length(plainto_tsquery('portuguese', 'cachorro')::text) > 0
           and length(plainto_tsquery('english', 'cachorro')::text) > 0
           and (to_tsvector('portuguese', s.text) @@ plainto_tsquery('portuguese', 'cachorro')
             or to_tsvector('english', s.text) @@ plainto_tsquery('english', 'cachorro'))`

      const text = JSON.stringify(plan)

      expect(text).toContain('BitmapOr')
      expect(text).toContain('segments_text_search_ptbr')
      expect(text).toContain('segments_text_search_en')
      expect(text).not.toContain('Seq Scan')
    })

    // Someone will type one eventually, and `to_tsquery` would throw.
    it.each(['cachorro & gato', "o 'cachorro'", 'cachorro | <->', "it's & podcasts"])(
      'survives query syntax typed by accident: %o',
      async (query) => {
        await expect(search.search(query, 10)).resolves.toBeInstanceOf(Array)
      },
    )
  })

  describe('the dictionary, in both languages', () => {
    /*
     * 760 spellings sit in both halves with different lemmas — `aches` is
     * `achar` ("to find") in Portuguese and `ache` in English, `admires` is
     * `admirar` and `admire`. Under the old single-column key, whichever
     * half loaded second would have overwritten the other and every one of
     * those words would have been grouped under the wrong language, silently.
     */
    it('keeps a spelling that means different things in each language apart', async () => {
      const rows = await client`
        select p.form, p.lemma as pt, e.lemma as en
          from lemmas p join lemmas e on e.form = p.form
         where p.language = 'pt' and e.language = 'en' and p.lemma <> e.lemma
         limit 1`

      expect(rows.length).toBe(1)
      expect(rows[0]?.pt).not.toBe(rows[0]?.en)
    })

    it('still holds the whole Portuguese dictionary after the English load', async () => {
      const rows = await client`
        select count(*)::int as n from lemmas where language = 'pt'`

      expect(rows[0]?.n).toBeGreaterThan(800_000)
    })

    // The irregulars are the reason for a dictionary at all: no stemmer gets
    // from `went` to `go`.
    it('resolves the English irregulars a stemmer cannot', async () => {
      const rows = await client<Array<{ form: string; lemma: string }>>`
        select form, lemma from lemmas
         where language = 'en'
           and form = any(${['was', 'went', 'children', 'mice', 'better']})`
      const found = new Map(rows.map((row) => [row.form, row.lemma]))

      expect(found.get('was')).toBe('be')
      expect(found.get('went')).toBe('go')
      expect(found.get('children')).toBe('child')
      expect(found.get('mice')).toBe('mouse')
      expect(found.get('better')).toBe('good')
    })
  })
}
