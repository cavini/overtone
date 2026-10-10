import { describe, expect, it } from 'vitest'
import type { EpisodeDirectory } from '../ports/episode-directory.js'

/** What a test must provide to be held to this contract. */
export interface EpisodeDirectoryUnderTest {
  readonly directory: EpisodeDirectory
  /** An episode number the feed really publishes. */
  readonly known: number
  /** One it certainly does not. */
  readonly missing: number
  teardown?(): Promise<void>
}

/**
 * The contract every `EpisodeDirectory` has to satisfy, fake included.
 */
export function describeEpisodeDirectory(
  name: string,
  setUp: () => Promise<EpisodeDirectoryUnderTest>,
): void {
  describe(`${name} (EpisodeDirectory contract)`, () => {
    const withDirectory = async (
      body: (subject: EpisodeDirectoryUnderTest) => Promise<void>,
    ): Promise<void> => {
      const subject = await setUp()
      try {
        await body(subject)
      } finally {
        await subject.teardown?.()
      }
    }

    it('finds an episode the feed publishes', async () => {
      await withDirectory(async ({ directory, known }) => {
        const found = await directory.find(known)

        expect(found?.number).toBe(known)
        expect(found?.title.length).toBeGreaterThan(0)
      })
    })

    // An episode not in the feed is ordinary — a clip, something unpublished,
    // a number nobody used. It is not an error and must not read as one.
    it('says nothing about an episode the feed has never heard of', async () => {
      await withDirectory(async ({ directory, missing }) => {
        expect(await directory.find(missing)).toBeUndefined()
      })
    })

    it('answers the same way twice', async () => {
      await withDirectory(async ({ directory, known }) => {
        expect(await directory.find(known)).toEqual(await directory.find(known))
      })
    })

    // Numbers that cannot be episodes must not become requests, or a typo
    // turns into traffic.
    it.each([0, -1, 1.5, Number.NaN])('refuses %o without asking the feed', async (number) => {
      await withDirectory(async ({ directory }) => {
        expect(await directory.find(number)).toBeUndefined()
      })
    })
  })
}
