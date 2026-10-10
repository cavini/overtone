// US-047
import { drizzle } from 'drizzle-orm/pg-proxy'
import { beforeEach, describe, expect, it } from 'vitest'
import { DrizzleTranscriptSearch } from './drizzle-transcript-search.js'

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

describe('DrizzleTranscriptSearch', () => {
  /*
   * The index in migration 0006 is built on `to_tsvector('portuguese', text)`.
   * Postgres only uses an expression index when the query's expression
   * matches it exactly — otherwise it quietly scans every segment of every
   * episode, which still returns the right answer and gets slower every week.
   */
  it('searches with the expression the index was built on', async () => {
    await search.search('cachorro', 50)

    expect(statements[0]).toContain(`to_tsvector('portuguese'`)
    expect(statements[0]).toContain(`plainto_tsquery('portuguese'`)
  })

  // Stemming is the reason for naming the language at all: `simple` would
  // match "cachorro" and miss "cachorros".
  it('does not fall back to the language-agnostic configuration', async () => {
    await search.search('cachorro', 50)

    expect(statements[0]).not.toContain(`'simple'`)
  })

  // `plainto_tsquery` reads the input as words. `to_tsquery` would read it
  // as query syntax and throw on an ampersand somebody typed.
  it('treats what was typed as words, not as query syntax', async () => {
    await search.search('cachorro & gato', 50)

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
    await search.search('x', 50)

    expect(statements[0]).toMatch(/join "transcripts"/i)
    expect(statements[0]).toMatch(/join "episodes"/i)
  })

  // A half-transcribed episode would return moments from the part that
  // happens to be done and silently omit the rest.
  it('only searches episodes that finished', async () => {
    await search.search('x', 50)

    expect(statements[0]).toContain('"status"')
  })

  it('returns segments in order within an episode', async () => {
    await search.search('x', 50)

    expect(statements[0]).toMatch(/order by/i)
    expect(statements[0]).toMatch(/"start_ms" asc/i)
  })

  it('bounds the rows it asks for', async () => {
    await search.search('x', 50)

    expect(statements[0]).toMatch(/limit/i)
  })
})
