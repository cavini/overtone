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
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { episodes, segments, series, seriesMembers, transcripts } from '../schema.js'
import { DrizzleTranscriptSearch } from './drizzle-transcript-search.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

/** An owner id no real account can have, so the cleanup cannot reach real rows. */
const OWNER = '00000000-0000-0000-0000-000000001a46'

/*
 * What these tests measure, seeded rather than assumed.
 *
 * The numbers in the comments below were measured against the archive, and
 * the assertions used to read it directly — so deleting an episode turned
 * them red without a line of code changing. The sentences here carry the
 * same cases the archive did:
 *
 * - `podcast` **singular**, because the loanword case is a reader typing the
 *   English plural at text that does not have it;
 * - `anos`, because the reader types `ano` and Portuguese stemming leaves a
 *   short plural joined;
 * - the Portuguese stop words, so the English half really does hold them.
 */
const SPOKEN = [
  'O cachorro do Dex latiu a noite inteira.',
  'A gente grava um podcast toda semana, e esse é o melhor.',
  'Faz dois anos que isso aconteceu e ainda falam disso.',
  'Ele não quis falar para ninguém depois daquilo.',
  'Eu falei que ia comer em casa depois do trabalho.',
  'Que coisa, né? Essa coisa toda de falar de casa.',
] as const

if (url === undefined || url.length === 0) {
  describe('searching in both languages', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} })
  const db = drizzle(client)
  const search = new DrizzleTranscriptSearch(db)

  let episodeId = ''
  let seriesId = ''
  let transcriptId = ''

  /**
   * How many of **these** segments one configuration alone would match.
   *
   * Scoped to the seeded transcript. Counting the whole table would make
   * every number here a report on what happens to be in a shared database.
   */
  const inOneLanguage = async (configuration: 'portuguese' | 'english', query: string) => {
    const rows = await client`
      select count(*)::int as n from segments s
       where s.transcript_id = ${transcriptId}
         and to_tsvector(${client.unsafe(`'${configuration}'`)}, s.text)
          @@ plainto_tsquery(${client.unsafe(`'${configuration}'`)}, ${query})`
    return rows[0]?.n ?? 0
  }

  describe('searching in both languages', () => {
    /** Only what this test seeded. The database is shared with real episodes. */
    const mine = <T extends { readonly episodeId: string }>(found: readonly T[]): T[] =>
      found.filter((match) => match.episodeId === episodeId)

    beforeAll(async () => {
      await db.delete(series).where(eq(series.ownerId, OWNER))

      const [created] = await db
        .insert(series)
        .values({ ownerId: OWNER, title: 'Languages' })
        .returning({ id: series.id })
      seriesId = created?.id ?? ''
      await db.insert(seriesMembers).values({ seriesId, userId: OWNER, role: 'owner' })

      const [episode] = await db
        .insert(episodes)
        .values({ seriesId, number: 1, title: 'Seeded', status: 'ready' })
        .returning({ id: episodes.id })
      episodeId = episode?.id ?? ''

      const [transcript] = await db
        .insert(transcripts)
        .values({
          episodeId,
          provider: 'fake',
          providerModel: 'seed',
          rawProviderPayload: [],
          fullText: SPOKEN.join(' '),
        })
        .returning({ id: transcripts.id })
      transcriptId = transcript?.id ?? ''

      await db.insert(segments).values(
        SPOKEN.map((text, position) => ({
          transcriptId,
          position,
          startMs: position * 5_000,
          endMs: position * 5_000 + 4_000,
          text,
          words: [],
        })),
      )
    })

    afterAll(async () => {
      await db.delete(series).where(eq(series.ownerId, OWNER))
    })

    it('still finds a word that was actually said in Portuguese', async () => {
      expect(mine(await search.search(seriesId, 'cachorro', 300))).toHaveLength(1)
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

      const found = mine(await search.search(seriesId, 'podcasts', 300))

      expect(found.length).toBeGreaterThan(0)
      expect(found.every((match) => /podcast/iu.test(match.text))).toBe(true)
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
      const found = mine(await search.search(seriesId, 'ano', 300))

      // Nothing at all through Portuguese alone; the English half is the
      // only reason this word is findable.
      expect(throughPortuguese).toBe(0)
      expect(found.length).toBeGreaterThan(throughPortuguese)
      expect(found.every((match) => /anos/iu.test(match.text))).toBe(true)
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
        expect(mine(await search.search(seriesId, word, 300))).toEqual([])
      },
    )

    // Symmetrically. `the` is a content word to the Portuguese configuration,
    // so on an English episode it would match every segment.
    it.each(['the', 'and', 'that'])('returns nothing for the English stop word %s', async (word) => {
      expect(mine(await search.search(seriesId, word, 300))).toEqual([])
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
        const found = mine(await search.search(seriesId, word, 1_000))

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
        await expect(search.search(seriesId, query, 10)).resolves.toBeInstanceOf(Array)
      },
    )
  })

  /*
   * The English half is loaded by a script, not a migration, and must not be
   * loaded until this change is on `main`: the deployed `lemmaQuery` has no
   * language filter and collapses duplicate forms with last-row-wins, so both
   * halves present would resolve 760 spellings to whichever language came
   * back last. Skipped rather than failed until somebody runs
   * `pnpm fetch:lemmas en && pnpm --filter @overtone/db db:load-lemmas en`.
   */
  const [{ n: englishPairs = 0 } = {}] = await client<Array<{ n: number }>>`
    select count(*)::int as n from lemmas where language = 'en'`
  const whenLoaded = englishPairs > 0 ? describe : describe.skip

  whenLoaded('the dictionary, in both languages', () => {
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
