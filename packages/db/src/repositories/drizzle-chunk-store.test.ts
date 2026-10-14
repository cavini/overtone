// US-040 · ADR 0020
import type { ChunkTranscript } from '@overtone/core'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { beforeEach, describe, expect, it } from 'vitest'
import { DrizzleChunkStore } from './drizzle-chunk-store.js'

const EPISODE = '55555555-5555-5555-5555-555555555555'

let statements: string[]
let store: DrizzleChunkStore

const rowsFor = (sql: string): unknown[][] => {
  if (!sql.toLowerCase().startsWith('select')) return []
  // index, offset_ms, words, segment_starts_ms — in select order
  if (sql.includes('offset_ms')) {
    return [
      [0, 0, [{ text: 'olá', startMs: 0, endMs: 400 }], [0]],
      // Null, the way every chunk stored before that column existed reads.
      [1, 1_200_000, [], null],
    ]
  }
  return [[0], [1]]
}

beforeEach(() => {
  statements = []
  const db = drizzle(async (sql) => {
    statements.push(sql)
    return { rows: rowsFor(sql) }
  })
  store = new DrizzleChunkStore(db)
})

describe('DrizzleChunkStore', () => {
  describe('transcribedIndexes', () => {
    it('reads only the index, not the words', async () => {
      await store.transcribedIndexes(EPISODE)

      const sql = statements[0] ?? ''
      expect(sql).toContain('"index"')
      // A two-hour episode's words are megabytes. Pacing only needs to know
      // which chunks are done.
      expect(sql).not.toContain('"words"')
    })

    it('scopes to the episode', async () => {
      await store.transcribedIndexes(EPISODE)
      expect(statements[0]).toMatch(/where/i)
    })

    it('returns them in order', async () => {
      expect(await store.transcribedIndexes(EPISODE)).toEqual([0, 1])
      expect(statements[0]).toMatch(/order by/i)
    })
  })

  describe('transcripts', () => {
    it('reads what stitching needs, in chunk order', async () => {
      const transcripts = await store.transcripts(EPISODE)

      expect(statements[0]).toMatch(/order by/i)
      expect(transcripts[0]).toMatchObject({ index: 0, offsetMs: 0 })
      expect(transcripts[1]).toMatchObject({ index: 1, offsetMs: 1_200_000 })
    })

    // The offset the encoder actually used, not the one the plan predicted.
    // Boundaries move to the nearest gap between words (US-040), and
    // stitching with the planned offset would put every later timestamp in
    // the wrong place.
    it('brings back the real offset', async () => {
      const transcripts = await store.transcripts(EPISODE)
      expect(transcripts.map((t) => t.offsetMs)).toEqual([0, 1_200_000])
    })
  })

  describe('save', () => {
    const chunk: ChunkTranscript = {
      index: 3,
      offsetMs: 3_600_000,
      words: [{ text: 'feijão', startMs: 100, endMs: 500 }],
    }

    it('writes the chunk', async () => {
      await store.save(EPISODE, chunk)
      expect(statements[0]).toMatch(/insert into "chunk_transcripts"/i)
    })

    // A chunk is paid for out of a budget of three episodes a day. A retry
    // that duplicated it would double every word in that stretch; one that
    // threw would lose work already paid for. Upsert does neither.
    it('replaces rather than duplicating when a chunk is sent twice', async () => {
      await store.save(EPISODE, chunk)

      const sql = statements[0] ?? ''
      expect(sql).toMatch(/on conflict/i)
      expect(sql).toMatch(/do update/i)
    })

    it('makes one statement', async () => {
      await store.save(EPISODE, chunk)
      expect(statements).toHaveLength(1)
    })
  })
})
