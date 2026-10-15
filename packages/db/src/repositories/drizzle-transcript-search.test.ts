// US-047
import { drizzle } from 'drizzle-orm/pg-proxy'
import { beforeEach, describe, expect, it } from 'vitest'
import { DrizzleTranscriptSearch } from './drizzle-transcript-search.js'

/** Whose library is being searched. Required by the port. */
const SERIES = '11111111-1111-1111-1111-111111111111'

let statements: string[]
let search: DrizzleTranscriptSearch

beforeEach(() => {
  statements = []
  const db = drizzle(async (sql) => {
    statements.push(sql)
    return { rows: [] }
  })
  search = new DrizzleTranscriptSearch(db)
})

/** One Postgres text-search configuration per audio language. */
const CONFIGURATION_COUNT = 2

describe('DrizzleTranscriptSearch', () => {
  /*
   * The index in migration 0006 is built on `to_tsvector('portuguese', text)`.
   * Postgres only uses an expression index when the query's expression
   * matches it exactly — otherwise it quietly scans every segment of every
   * episode, which still returns the right answer and gets slower every week.
   */
  it('searches with the expression the index was built on', async () => {
    await search.search(SERIES, 'cachorro', 50)

    expect(statements[0]).toContain(`to_tsvector('portuguese'`)
    expect(statements[0]).toContain(`plainto_tsquery('portuguese'`)
  })

  // Stemming is the reason for naming the language at all: `simple` would
  // match "cachorro" and miss "cachorros".
  it('does not fall back to the language-agnostic configuration', async () => {
    await search.search(SERIES, 'cachorro', 50)

    expect(statements[0]).not.toContain(`'simple'`)
  })

  // `plainto_tsquery` reads the input as words. `to_tsquery` would read it
  // as query syntax and throw on an ampersand somebody typed.
  it('treats what was typed as words, not as query syntax', async () => {
    await search.search(SERIES, 'cachorro & gato', 50)

    const sql = statements[0] ?? ''
    // Every `to_tsquery` in the statement must be part of a
    // `plainto_tsquery`. A bare one would read the input as query syntax
    // and throw on an ampersand somebody typed.
    const all = sql.match(/to_tsquery/gu) ?? []
    const plain = sql.match(/plainto_tsquery/gu) ?? []

    expect(plain.length).toBeGreaterThan(0)
    expect(all.length).toBe(plain.length)
  })

  it('reaches the episode through its transcript', async () => {
    await search.search(SERIES, 'x', 50)

    expect(statements[0]).toMatch(/join "transcripts"/i)
    expect(statements[0]).toMatch(/join "episodes"/i)
  })

  // A half-transcribed episode would return moments from the part that
  // happens to be done and silently omit the rest.
  it('only searches episodes that finished', async () => {
    await search.search(SERIES, 'x', 50)

    expect(statements[0]).toContain('"status"')
  })

  it('returns segments in order within an episode', async () => {
    await search.search(SERIES, 'x', 50)

    expect(statements[0]).toMatch(/order by/i)
    expect(statements[0]).toMatch(/"start_ms" asc/i)
  })

  /*
   * The budget is spent per episode, so every episode that matched is in
   * the answer.
   *
   * Two earlier versions of this got it wrong in the same silent way. The
   * first handed the 300 rows out newest-first, so a term discussed at
   * length in episode 1 vanished once later episodes mentioned it in
   * passing. The second ranked by how much each episode matched, which
   * sounds like a ranking and behaves like a cliff: on a real library the
   * busiest episode's 321 lines took all 300 rows and the other fourteen
   * episodes were never looked at.
   *
   * Numbering within each episode and cutting at the budget is the only one
   * of the three that cannot hide an episode.
   */
  it('numbers the rows within each episode', async () => {
    await search.search(SERIES, 'cachorro', 20)

    const sql = statements[0] ?? ''
    expect(sql).toMatch(/row_number\(\) over\s*\(\s*partition by/i)
    // Partitioned by episode, not by anything else: partitioning by the
    // transcript or the series would bound the wrong thing.
    expect(sql).toMatch(/partition by "episodes"\."id"/i)
  })

  it('cuts each episode at the budget it was given', async () => {
    await search.search(SERIES, 'x', 50)

    const sql = statements[0] ?? ''
    // A window function cannot go in `where`, so the cut is on the subquery.
    expect(sql).toMatch(/"rank" <=/i)
    expect(sql).not.toMatch(/limit/i)
  })
})

describe('DrizzleTranscriptSearch, in both languages', () => {
  /*
   * Two expression indexes, two expressions in the query.
   *
   * The archive now holds episodes in either language, and a Portuguese one
   * is full of English loanwords either way. `portuguese` leaves `deploys`
   * alone, so a search for `deploy` misses it; `english` reduces both.
   */
  it('searches with the expression each index was built on', async () => {
    await search.search(SERIES, 'deploy', 50)

    expect(statements[0]).toContain(`to_tsvector('portuguese'`)
    expect(statements[0]).toContain(`to_tsvector('english'`)
    expect(statements[0]).toContain(`plainto_tsquery('portuguese'`)
    expect(statements[0]).toContain(`plainto_tsquery('english'`)
  })

  it('still reads what was typed as words, not as query syntax', async () => {
    await search.search(SERIES, 'deploy & cachorro', 50)

    const sql = statements[0] ?? ''
    const all = sql.match(/to_tsquery/gu) ?? []
    const plain = sql.match(/plainto_tsquery/gu) ?? []

    /*
     * The invariant, not the count.
     *
     * How many times the query is parsed is an implementation detail, and it
     * grows whenever the statement gains a clause — highlighting added one
     * per configuration. What must never change is that none of them is a
     * bare `to_tsquery`, which would read an ampersand somebody typed as an
     * operator and throw.
     */
    expect(plain.length).toBeGreaterThanOrEqual(2)
    expect(all.length).toBe(plain.length)
  })

  /*
   * A word one configuration treats as a stop word must not come back in
   * through the other's list.
   *
   * `que` parses to nothing in Portuguese and to `'que'` in English, and the
   * English index holds it for 2,172 of the archive's 6,952 segments. Without
   * this gate, searching for `que` would turn "no results" into a third of
   * every episode ever recorded — and `não` into a quarter. The same applies
   * the other way for `the`, which Portuguese would happily match on an
   * English episode.
   */
  it('discards a query that either configuration reduces to nothing', async () => {
    await search.search(SERIES, 'que', 50)

    expect(statements[0]).toMatch(/length\(plainto_tsquery\('portuguese'/)
    expect(statements[0]).toMatch(/length\(plainto_tsquery\('english'/)
  })

  // The two halves are OR-ed, not AND-ed: a loanword only the English index
  // knows about still has to come back.
  it('matches in either language', async () => {
    await search.search(SERIES, 'podcasts', 50)

    expect(statements[0]).toMatch(/@@[\s\S]*\bor\b[\s\S]*@@/i)
  })
})
