import { describe, expect, it } from 'vitest'
import type { ChunkTranscript } from '../domain/audio-chunk.js'
import type { ChunkStore } from '../ports/chunk-store.js'

/** What a test must provide to be held to this contract. */
export interface ChunkStoreUnderTest {
  readonly store: ChunkStore
  /**
   * Two episode ids the store will accept, so the contract can prove one
   * episode's chunks never show up under another. A real store needs the rows
   * to exist; a fake needs nothing.
   */
  readonly episodeIds: readonly [string, string]
  reset(): Promise<void>
  teardown?(): Promise<void>
}

const chunk = (index: number, offsetMs: number, text: string): ChunkTranscript => ({
  index,
  offsetMs,
  words: [{ text, startMs: 120, endMs: 480 }],
})

/**
 * The contract every `ChunkStore` has to satisfy, fake included.
 *
 * Chunk transcripts are the one thing in the pipeline that must survive
 * between steps: an episode of this show cannot be transcribed on one balance
 * (ADR 0020), so the work spans process lifetimes. A store that loses or
 * duplicates a chunk costs allowance out of a budget of three episodes a day.
 */
export function describeChunkStore(
  name: string,
  setUp: () => Promise<ChunkStoreUnderTest>,
): void {
  describe(`${name} (ChunkStore contract)`, () => {
    const withStore = async (
      body: (subject: ChunkStoreUnderTest) => Promise<void>,
    ): Promise<void> => {
      const subject = await setUp()
      await subject.reset()
      try {
        await body(subject)
      } finally {
        await subject.teardown?.()
      }
    }

    it('has nothing for an episode that has not started', async () => {
      await withStore(async ({ store, episodeIds: [episode] }) => {
        expect(await store.transcribedIndexes(episode)).toEqual([])
        expect(await store.transcripts(episode)).toEqual([])
      })
    })

    it('reports what has been transcribed', async () => {
      await withStore(async ({ store, episodeIds: [episode] }) => {
        await store.save(episode, chunk(0, 0, 'olá'))
        await store.save(episode, chunk(1, 1_200_000, 'pirão'))

        expect(await store.transcribedIndexes(episode)).toEqual([0, 1])
      })
    })

    // Stitching walks these in order and adds each offset in turn. Out of
    // order, every timestamp after the first seam lands somewhere else.
    it('returns chunks in order however they arrived', async () => {
      await withStore(async ({ store, episodeIds: [episode] }) => {
        await store.save(episode, chunk(2, 2_400_000, 'três'))
        await store.save(episode, chunk(0, 0, 'um'))
        await store.save(episode, chunk(1, 1_200_000, 'dois'))

        expect((await store.transcripts(episode)).map((c) => c.index)).toEqual([0, 1, 2])
        expect(await store.transcribedIndexes(episode)).toEqual([0, 1, 2])
      })
    })

    it('keeps the words and the offset it was given', async () => {
      await withStore(async ({ store, episodeIds: [episode] }) => {
        await store.save(episode, chunk(3, 3_600_000, 'garrafinha'))

        expect((await store.transcripts(episode))[0]).toEqual({
          index: 3,
          offsetMs: 3_600_000,
          words: [{ text: 'garrafinha', startMs: 120, endMs: 480 }],
        })
      })
    })

    it('reads one chunk on its own', async () => {
      await withStore(async ({ store, episodeIds: [episode] }) => {
        await store.save(episode, chunk(0, 0, 'primeiro'))
        await store.save(episode, chunk(1, 600_000, 'segundo'))

        expect(await store.transcript(episode, 1)).toEqual({
          index: 1,
          offsetMs: 600_000,
          words: [{ text: 'segundo', startMs: 120, endMs: 480 }],
        })
      })
    })

    it('has nothing for a chunk that has not come back', async () => {
      await withStore(async ({ store, episodeIds: [episode] }) => {
        await store.save(episode, chunk(0, 0, 'primeiro'))
        expect(await store.transcript(episode, 7)).toBeUndefined()
      })
    })

    it("never reads one episode's chunk under another", async () => {
      await withStore(async ({ store, episodeIds: [first, second] }) => {
        await store.save(first, chunk(0, 0, 'aqui'))
        expect(await store.transcript(second, 0)).toBeUndefined()
      })
    })

    // A chunk is paid for out of a budget of three episodes a day. Saving it
    // twice must not double every word in that stretch of the episode.
    it('replaces a chunk saved twice rather than duplicating it', async () => {
      await withStore(async ({ store, episodeIds: [episode] }) => {
        await store.save(episode, chunk(0, 0, 'primeiro'))
        await store.save(episode, chunk(0, 0, 'segundo'))

        const stored = await store.transcripts(episode)
        expect(stored).toHaveLength(1)
        expect(stored[0]?.words[0]?.text).toBe('segundo')
      })
    })

    it("never shows one episode's chunks under another", async () => {
      await withStore(async ({ store, episodeIds: [mine, theirs] }) => {
        await store.save(mine, chunk(0, 0, 'meu'))

        expect(await store.transcribedIndexes(theirs)).toEqual([])
        expect(await store.transcripts(theirs)).toEqual([])
      })
    })

    // Two episodes can be mid-transcription at once, and they number their
    // chunks from zero independently.
    it('keeps the same index apart across episodes', async () => {
      await withStore(async ({ store, episodeIds: [mine, theirs] }) => {
        await store.save(mine, chunk(0, 0, 'meu'))
        await store.save(theirs, chunk(0, 0, 'seu'))

        expect((await store.transcripts(mine))[0]?.words[0]?.text).toBe('meu')
        expect((await store.transcripts(theirs))[0]?.words[0]?.text).toBe('seu')
      })
    })

    // A chunk whose words came back empty is still a transcribed chunk —
    // silence, or a stretch of music. Treating it as missing would re-send it
    // forever and never finish the episode.
    it('counts a silent chunk as done', async () => {
      await withStore(async ({ store, episodeIds: [episode] }) => {
        await store.save(episode, { index: 0, offsetMs: 0, words: [] })

        expect(await store.transcribedIndexes(episode)).toEqual([0])
        expect((await store.transcripts(episode))[0]?.words).toEqual([])
      })
    })
  })
}
