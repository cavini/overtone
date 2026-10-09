// Guards the seam between the database and the domain.
//
// Drizzle gives the schema a TypeScript type, and the domain has read models
// the application works in. Nothing stops the two drifting apart silently —
// a renamed column or a new status compiles fine and fails at runtime, in
// production, on somebody's episode. These assertions make that drift a build
// failure instead.
import type { EpisodeStatus, TopicTally } from '@overtone/core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  episodes,
  insights,
  lemmas,
  mentions,
  segments,
  seriesMembers,
  termCounts,
  topics,
  transcripts,
} from './schema.js'

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect']

describe('the episode status column', () => {
  // The six canonical strings. A status added to one side and not the other
  // is the exact bug this catches.
  it('holds exactly the statuses the domain defines', () => {
    const inSchema = [...episodes.status.enumValues].sort()
    const inDomain: EpisodeStatus[] = [
      'uploaded', 'transcribing', 'analyzing', 'ready', 'failed', 'deleting',
    ]
    expect(inSchema).toEqual([...inDomain].sort())
  })

  it('types the column as the domain type, not as a loose string', () => {
    expectTypeOf<Row<typeof episodes>['status']>().toEqualTypeOf<EpisodeStatus>()
  })
})

describe('rows line up with what the application expects', () => {
  it('an episode row carries what an episode summary needs', () => {
    expectTypeOf<Row<typeof episodes>['id']>().toEqualTypeOf<string>()
    expectTypeOf<Row<typeof episodes>['number']>().toEqualTypeOf<number>()
    expectTypeOf<Row<typeof episodes>['title']>().toEqualTypeOf<string>()
    expectTypeOf<Row<typeof episodes>['durationMs']>().toEqualTypeOf<number>()
  })

  it('an insight row carries the per-episode totals', () => {
    expectTypeOf<Row<typeof insights>['wordTokens']>().toEqualTypeOf<number>()
    expectTypeOf<Row<typeof insights>['uniqueTerms']>().toEqualTypeOf<number>()
  })

  // Asserted structurally rather than by importing the repository's type:
  // two adapters should not depend on each other, and the shape is the whole
  // contract.
  it('a lemma row is what the dictionary repository reads', () => {
    expectTypeOf<Row<typeof lemmas>>().toExtend<{ form: string; lemma: string }>()
  })

  it('a term count row carries its surface forms and its honesty flag', () => {
    expectTypeOf<Row<typeof termCounts>['surfaceForms']>().toEqualTypeOf<string[]>()
    expectTypeOf<Row<typeof termCounts>['heuristic']>().toEqualTypeOf<boolean>()
  })

  it('a mention row can become a topic tally', () => {
    expectTypeOf<Row<typeof mentions>['episodeId']>().toEqualTypeOf<string>()
    expectTypeOf<Row<typeof mentions>['topicId']>().toEqualTypeOf<string>()
    expectTypeOf<TopicTally['count']>().toEqualTypeOf<number>()
  })
})

describe('the decisions the schema is supposed to encode', () => {
  // ADR 0017. A sentence in a row cannot be read in two languages.
  it('stores a failure as a code and its data, never as a message', () => {
    expectTypeOf<Row<typeof episodes>>().toHaveProperty('failureCode')
    expectTypeOf<Row<typeof episodes>>().toHaveProperty('failureParams')
    expect(Object.keys(episodes)).not.toContain('failureMessage')
  })

  // ADR 0011. One row per token would fill the free database at around 110
  // episodes, so word timings ride on the segment as compact JSON.
  it('keeps word timings on the segment rather than one row per token', () => {
    expectTypeOf<Row<typeof segments>>().toHaveProperty('words')
    expect(Object.keys(segments)).toContain('words')
  })

  // ADR 0005. The expensive, rate-limited step is kept so the cheap,
  // deterministic one can be re-run for nothing.
  it('keeps the provider payload so analysis can be re-run for free', () => {
    expect(Object.keys(transcripts)).toContain('rawProviderPayload')
  })

  // ADR 0012. Reads are scoped by membership, which is what makes inviting a
  // co-host a row insert rather than a migration touching every query.
  it('gives a series members from the first migration', () => {
    expect(Object.keys(seriesMembers)).toEqual(
      expect.arrayContaining(['seriesId', 'userId', 'role']),
    )
  })

  // ADR 0015. There is one edited file per episode, so nothing can be
  // attributed to a person and the dimension is absent rather than empty.
  it('has no speaker dimension anywhere', () => {
    for (const table of [episodes, segments, mentions, termCounts]) {
      const columns = Object.keys(table).join(' ').toLowerCase()
      expect(columns).not.toContain('speaker')
      expect(columns).not.toContain('host')
    }
  })

  // ADR 0006. A running joke belongs to the show, which is what makes
  // "how many times have we ever" one indexed aggregate.
  it('scopes a topic to the series rather than to an episode', () => {
    expect(Object.keys(topics)).toContain('seriesId')
    expect(Object.keys(topics)).not.toContain('episodeId')
  })
})
