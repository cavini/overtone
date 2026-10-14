import { describe, expect, it } from 'vitest'
import type { EpisodeFeed } from '../ports/episode-feed.js'

/** What a test must provide to be held to this contract. */
export interface EpisodeFeedUnderTest {
  readonly feed: EpisodeFeed
  /** The show the feed was scoped to, so its items can be recognised. */
  readonly show: string
  teardown?(): Promise<void>
}

/**
 * The contract every `EpisodeFeed` has to satisfy.
 *
 * Deliberately about the shape of the answer rather than its contents: the
 * invented feed in the unit suite and the show's real one hold different
 * episodes, and the properties that matter are true of both. A backfill
 * walks this list unattended for days — a duplicate number would upload an
 * episode twice, a descending list would start at the wrong end, and an
 * entry with no audio would be a download that cannot happen.
 */
export function describeEpisodeFeed(
  name: string,
  setUp: () => Promise<EpisodeFeedUnderTest>,
): void {
  describe(`${name} (EpisodeFeed contract)`, () => {
    const withFeed = async (
      body: (subject: EpisodeFeedUnderTest) => Promise<void>,
    ): Promise<void> => {
      const subject = await setUp()
      try {
        await body(subject)
      } finally {
        await subject.teardown?.()
      }
    }

    it('has something in it', async () => {
      await withFeed(async ({ feed }) => {
        expect((await feed.list()).length).toBeGreaterThan(0)
      })
    })

    it('counts up from the oldest', async () => {
      await withFeed(async ({ feed }) => {
        const numbers = (await feed.list()).map((episode) => episode.number)

        expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
      })
    })

    // A number twice over is an episode uploaded twice, a day's allowance
    // spent on a transcript that already existed.
    it('claims each number once', async () => {
      await withFeed(async ({ feed }) => {
        const numbers = (await feed.list()).map((episode) => episode.number)

        expect(new Set(numbers).size).toBe(numbers.length)
      })
    })

    it('gives every entry somewhere to download from', async () => {
      await withFeed(async ({ feed }) => {
        for (const episode of await feed.list()) {
          expect(episode.audioUrl, `episode ${String(episode.number)}`).toMatch(/^https?:\/\//u)
        }
      })
    })

    it('names every entry', async () => {
      await withFeed(async ({ feed }) => {
        for (const episode of await feed.list()) {
          expect(episode.title.length).toBeGreaterThan(0)
        }
      })
    })

    /*
     * One feed carries several of the collective's programmes and the
     * numbers collide across them, so a list that is not scoped would hand
     * back somebody else's episode under this show's number.
     */
    it('lists only the show it was asked for', async () => {
      await withFeed(async ({ feed, show }) => {
        for (const episode of await feed.list()) {
          expect(episode.title.toLowerCase()).toContain(show.toLowerCase())
        }
      })
    })

    it('says the same thing twice', async () => {
      await withFeed(async ({ feed }) => {
        expect(await feed.list()).toEqual(await feed.list())
      })
    })
  })
}
