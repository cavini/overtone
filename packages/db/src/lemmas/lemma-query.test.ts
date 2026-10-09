// US-016 · ADR 0019
import { drizzle } from 'drizzle-orm/pg-proxy'
import { describe, expect, it } from 'vitest'
import { lemmaQuery } from './lemma-query.js'

const capturing = (rows: unknown[][] = []) => {
  const seen: Array<{ sql: string; params: unknown[] }> = []
  const db = drizzle(async (sql, params) => {
    seen.push({ sql, params })
    return { rows }
  })
  return { db, seen }
}

describe('lemmaQuery', () => {
  it('reads form and lemma for the forms it was given', async () => {
    const { db, seen } = capturing([['falei', 'falar']])
    const rows = await lemmaQuery(db)(['falei', 'falando'])

    expect(rows).toEqual([{ form: 'falei', lemma: 'falar' }])
    expect(seen[0]?.sql).toContain('"lemmas"')
    expect(seen[0]?.sql).toContain('"form"')
    expect(seen[0]?.sql).toContain('"lemma"')
  })

  // `= any($1)` takes the whole list as one parameter. An `in (…)` list would
  // put one placeholder per word, and an episode has thousands.
  it('passes the whole list as a single array parameter', async () => {
    const { db, seen } = capturing()
    await lemmaQuery(db)(['falei', 'falando', 'pirão'])

    expect(seen[0]?.sql).toMatch(/= any/i)
    expect(seen[0]?.params).toHaveLength(1)
    expect(seen[0]?.params[0]).toEqual(['falei', 'falando', 'pirão'])
  })

  it('reads nothing else from the dictionary table', async () => {
    const { db, seen } = capturing()
    await lemmaQuery(db)(['falei'])
    expect(seen[0]?.sql).not.toMatch(/join/i)
    expect(seen[0]?.sql).not.toMatch(/order by/i)
  })

  it('makes one query', async () => {
    const { db, seen } = capturing()
    await lemmaQuery(db)(['a', 'b', 'c'])
    expect(seen).toHaveLength(1)
  })

  it('returns nothing when the dictionary knows nothing', async () => {
    const { db } = capturing([])
    expect(await lemmaQuery(db)(['pirão'])).toEqual([])
  })
})
