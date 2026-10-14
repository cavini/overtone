// US-003, US-008, US-026 · ADR 0005
import type { StoredAnalysis } from '@overtone/core'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DrizzleEpisodeStore, writeAnalysis } from './drizzle-episode-store.js'

const EPISODE = '33333333-3333-3333-3333-333333333333'
const TRANSCRIPT = '44444444-4444-4444-4444-444444444444'

const analysis: StoredAnalysis = {
  transcript: {
    provider: 'groq',
    providerModel: 'whisper-large-v3-turbo',
    rawProviderPayload: { words: [] },
    fullText: 'hoje falamos do feijão',
    normalizationVersion: 1,
    vocabularyVersion: 1,
  },
  segments: [
    {
      position: 0,
      startMs: 0,
      endMs: 1_600,
      text: 'hoje falamos do feijão',
      words: [
        { surface: 'hoje', lemma: 'hoje', startMs: 0, endMs: 400, tokenClass: 'stopword' },
        { surface: 'feijão', lemma: 'feijão', startMs: 1_200, endMs: 1_600, tokenClass: 'word' },
      ],
    },
  ],
  insight: {
    pipelineVersion: 1,
    durationMs: 1_600,
    totalTokens: 4,
    wordTokens: 2,
    stopWordTokens: 2,
    fillerTokens: 0,
    uniqueTerms: 2,
    wordsPerMinute: 150,
    fillersPerMinute: 0,
  },
  termCounts: [
    { term: 'feijão', count: 1, surfaceForms: ['feijão'], heuristic: false },
  ],
  mentions: [
    { topicId: 't-1', matchedText: 'feijão', startMs: 1_200, endMs: 1_600 },
  ],
}

let statements: string[]
let db: ReturnType<typeof drizzle>

beforeEach(() => {
  statements = []
  db = drizzle(async (sql) => {
    statements.push(sql)
    // The transcript insert asks for its new id back.
    return sql.toLowerCase().includes('returning') ? { rows: [[TRANSCRIPT]] } : { rows: [] }
  })
})

const ran = (fragment: string) =>
  statements.filter((sql) => sql.toLowerCase().includes(fragment.toLowerCase()))

describe('writeAnalysis', () => {
  // Re-running analysis must replace what was there, not add to it. ADR 0005
  // makes re-analysis free and therefore frequent, so a second run that
  // doubled every count would be an everyday bug.
  describe('making a re-run safe', () => {
    it('clears the previous results before writing new ones', async () => {
      await writeAnalysis(db, EPISODE, analysis)

      const firstInsert = statements.findIndex((sql) => /^insert/i.test(sql))
      const lastDelete = statements.reduce(
        (last, sql, i) => (/^delete/i.test(sql) ? i : last),
        -1,
      )

      expect(lastDelete).toBeGreaterThanOrEqual(0)
      expect(lastDelete).toBeLessThan(firstInsert)
    })

    it.each(['transcripts', 'insights', 'term_counts', 'mentions'])(
      'clears %s',
      async (table) => {
        await writeAnalysis(db, EPISODE, analysis)
        expect(ran(`delete from "${table}"`)).toHaveLength(1)
      },
    )

    // Segments hang off the transcript and the foreign key cascades, so
    // deleting the transcript takes them along. A second delete would be
    // dead work on the hot path of every re-run.
    it('leaves the segments to the cascade rather than deleting them twice', async () => {
      await writeAnalysis(db, EPISODE, analysis)
      expect(ran('delete from "segments"')).toHaveLength(0)
    })

    it('scopes every delete to this episode alone', async () => {
      await writeAnalysis(db, EPISODE, analysis)
      for (const sql of statements.filter((s) => /^delete/i.test(s))) {
        expect(sql).toMatch(/where/i)
      }
    })
  })

  describe('what it writes', () => {
    beforeEach(async () => {
      await writeAnalysis(db, EPISODE, analysis)
    })

    it.each([
      'transcripts', 'segments', 'insights', 'term_counts', 'mentions',
    ])('inserts into %s', (table) => {
      expect(ran(`insert into "${table}"`).length).toBeGreaterThan(0)
    })

    it('asks for the new transcript id so the segments can hang off it', () => {
      expect(ran('returning').length).toBeGreaterThan(0)
    })

    it('writes the transcript before the segments that belong to it', () => {
      const transcript = statements.findIndex((s) => /insert into "transcripts"/i.test(s))
      const segments = statements.findIndex((s) => /insert into "segments"/i.test(s))
      expect(transcript).toBeLessThan(segments)
    })

    it('batches each table into one statement rather than one per row', () => {
      expect(ran('insert into "term_counts"')).toHaveLength(1)
      expect(ran('insert into "mentions"')).toHaveLength(1)
    })
  })

  it('writes nothing for the tables it has no rows for', async () => {
    await writeAnalysis(db, EPISODE, { ...analysis, mentions: [], termCounts: [] })
    expect(ran('insert into "mentions"')).toHaveLength(0)
    expect(ran('insert into "term_counts"')).toHaveLength(0)
  })
})

describe('DrizzleEpisodeStore', () => {
  // A half-written analysis — counts with no transcript behind them — is
  // worse than none, because the page looks finished.
  it('writes the whole analysis inside one transaction', async () => {
    const inner = { ran: false }
    const transactional = {
      transaction: vi.fn(async (body: (tx: unknown) => Promise<void>) => {
        inner.ran = true
        await body(db)
      }),
    }

    await new DrizzleEpisodeStore(transactional as never).save(EPISODE, analysis)

    expect(transactional.transaction).toHaveBeenCalledOnce()
    expect(inner.ran).toBe(true)
    expect(statements.length).toBeGreaterThan(0)
  })

  it('lets a failure escape so the episode is not marked ready', async () => {
    const failing = {
      transaction: () => Promise.reject(new Error('serialization failure')),
    }

    await expect(
      new DrizzleEpisodeStore(failing as never).save(EPISODE, analysis),
    ).rejects.toThrow('serialization failure')
  })

  describe('setStatus', () => {
    it('updates the episode', async () => {
      await new DrizzleEpisodeStore(db as never).setStatus(EPISODE, 'ready')
      expect(ran('update "episodes"')).toHaveLength(1)
    })

    it('stores a failure as a code and its data, never a sentence', async () => {
      await new DrizzleEpisodeStore(db as never).setStatus(EPISODE, 'failed', {
        code: 'ALLOWANCE_EXHAUSTED',
        retryAfterMs: 30_000,
      })

      const sql = ran('update "episodes"')[0] ?? ''
      expect(sql).toContain('failure_code')
      expect(sql).toContain('failure_params')
    })

    it('clears a previous failure when the episode succeeds', async () => {
      await new DrizzleEpisodeStore(db as never).setStatus(EPISODE, 'ready')
      const sql = ran('update "episodes"')[0] ?? ''
      expect(sql).toContain('failure_code')
    })
  })
})
