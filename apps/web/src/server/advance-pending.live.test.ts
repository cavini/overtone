// US-041 · an episode finishes whether or not anyone is watching
//
// Skipped without DATABASE_URL, because CI has no database.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { episodes, series, seriesMembers } from '@overtone/db/schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { advancePending, withAdvanceLease } from './advance-pending.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('advancePending', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  const other = postgres(url, { prepare: false, max: 2, onnotice: () => {} })
  const db = drizzle(other)
  const freeTheLease = () => other`update advance_lease set held_until = now()`

  /** An owner id no real account can have, so the cleanup cannot reach real rows. */
  const OWNER = '00000000-0000-0000-0000-00000000ad01'

  /** An episode stuck mid-transcription, the way a closed tab leaves one. */
  const anUnfinishedEpisode = async (status: 'uploaded' | 'transcribing'): Promise<string> => {
    const [made] = await db
      .insert(series)
      .values({ ownerId: OWNER, title: 'Unfinished' })
      .returning({ id: series.id })
    const seriesId = made?.id ?? ''
    await db.insert(seriesMembers).values({ seriesId, userId: OWNER, role: 'owner' })

    /*
     * Stamped in 1970, so this is deterministically the oldest.
     *
     * `advancePending` picks the oldest unfinished episode *anywhere* —
     * that is the point of it — so another suite seeding one in parallel
     * would otherwise win the race and fail this for the wrong reason. It
     * did once.
     */
    const [episode] = await db
      .insert(episodes)
      .values({
        seriesId,
        number: 1,
        title: 'Half done',
        status,
        durationMs: 60_000,
        createdAt: new Date(0),
      })
      .returning({ id: episodes.id })

    return episode?.id ?? ''
  }

  const clearUp = () => db.delete(series).where(eq(series.ownerId, OWNER))

  afterAll(async () => {
    await freeTheLease()
    await clearUp()
    await other.end()
  })

  describe('advancePending against real postgres', () => {
    /*
     * The reason the lock exists. Two runs overlapping would transcribe the
     * same chunk twice and pay for it twice out of a budget of three
     * episodes a day — and the schedule fires every minute, so overlapping
     * is the normal case rather than the unlucky one.
     */
    /*
     * The bug this lease exists for. The obvious tool is
     * `pg_try_advisory_lock`, and it is session-level — while the app speaks
     * to Postgres through the *transaction* pooler, where consecutive
     * statements can land on different backend sessions. Measured: a run
     * took the lock while another connection held it, silently, which is
     * precisely the double-spend the lock was there to stop. A conditional
     * UPDATE is atomic in one statement and so survives any pooling.
     */
    it('does nothing while another run holds the lease', async () => {
      await freeTheLease()
      const held = await other`
        update advance_lease set held_until = now() + make_interval(secs => 300)
         where held_until < now() returning held_until`
      expect(held.length).toBe(1)

      expect(await advancePending()).toEqual({ did: 'nothing', because: 'busy' })

      await freeTheLease()
    })

    /*
     * The way a lease stops being one.
     *
     * A run whose lease expires while it is still working finds the next
     * holder already started — and used to clear their claim on the way
     * out, because the release was an unconditional `set held_until =
     * now()`. A third run then walks straight in beside the second, and two
     * of them transcribe the same chunk and pay for it twice.
     *
     * The ceiling on the function is 300 seconds and so is the lease, so
     * there was no margin at all between "cannot happen" and this.
     */
    it('does not release a lease that has already been taken over', async () => {
      await freeTheLease()
      let takenOver = 0

      await withAdvanceLease(async () => {
        // Our lease expires while we are still working, and somebody else
        // claims it — exactly what a slow run looks like from outside.
        await other`update advance_lease set held_until = now()`
        takenOver = (
          await other`
            update advance_lease set held_until = now() + make_interval(secs => 300)
             where held_until < now() returning held_until`
        ).length
      })

      expect(takenOver, 'the second run never got the lease').toBe(1)

      // Our release has now run. The second run must still hold it.
      const stolen = await other`
        update advance_lease set held_until = now() + make_interval(secs => 300)
         where held_until < now() returning held_until`
      expect(stolen, 'the stale run released somebody else’s lease').toHaveLength(0)

      await freeTheLease()
    })

    // A run that released only on the happy path would cost five minutes of
    // a schedule that fires every one.
    it('gives the lease back when it is done', async () => {
      await freeTheLease()
      await advancePending()

      const free = await other`
        update advance_lease set held_until = now() + make_interval(secs => 300)
         where held_until < now() returning held_until`
      expect(free.length).toBe(1)
      await freeTheLease()
    })


  
    /*
     * The whole feature, and until now nothing proved it.
     *
     * Every other test here ran against an empty queue and watched it
     * answer "nothing to do" — which it would also do if the query were
     * wrong. An upload survives the tab closing only if this *finds* the
     * episode somebody walked away from.
     */
    it.each(['uploaded', 'transcribing'] as const)(
      'picks up an episode left %s',
      async (status) => {
        await freeTheLease()
        await clearUp()
        const episodeId = await anUnfinishedEpisode(status)

        const report = await advancePending()

        expect(report).toMatchObject({ did: 'advanced', episodeId })
        await clearUp()
      },
    )

    it('leaves a finished episode alone', async () => {
      await freeTheLease()
      await clearUp()
      const [made] = await db
        .insert(series)
        .values({ ownerId: OWNER, title: 'Done' })
        .returning({ id: series.id })
      const seriesId = made?.id ?? ''
      await db.insert(seriesMembers).values({ seriesId, userId: OWNER, role: 'owner' })
      const [done] = await db
        .insert(episodes)
        // Stamped in 1970, so if finished episodes were eligible this would
        // be the one picked.
        .values({
          seriesId,
          number: 1,
          title: 'Finished',
          status: 'ready',
          durationMs: 60_000,
          createdAt: new Date(0),
        })
        .returning({ id: episodes.id })

      expect(await advancePending()).not.toMatchObject({ episodeId: done?.id })
      await clearUp()
    })

    /*
     * The head-of-line block, which is what makes this worth testing at all.
     *
     * The runner takes the oldest unfinished episode every minute. One
     * whose audio never arrived can never finish, so without giving up on
     * it eventually it sits at the front of the queue forever — picked
     * every minute, failing every minute, and starving every episode
     * behind it.
     */
    it('gives up on an upload whose audio never arrived, so the queue moves', async () => {
      await freeTheLease()
      await clearUp()

      const stuck = await anUnfinishedEpisode('transcribing')
      // Older than the grace period, so it counts as abandoned.
      await db
        .update(episodes)
        .set({ createdAt: new Date(Date.now() - 2 * 60 * 60_000) })
        .where(eq(episodes.id, stuck))

      await advancePending()

      const [after] = await db
        .select({ status: episodes.status })
        .from(episodes)
        .where(eq(episodes.id, stuck))

      /*
       * Out of the queue, which is the whole point — a `failed` episode is
       * no longer eligible, so whatever is behind it can be reached.
       *
       * Asserted on this episode's own status rather than by asking the
       * queue again: other suites run in parallel against the same
       * database, and what they have in flight is not this test's business.
       */
      expect(after?.status).toBe('failed')

      await clearUp()
    })

    // And the other direction: the row is written before the chunks are
    // uploaded, so giving up straight away would kill a good upload.
    it('waits on an upload that only just started', async () => {
      await freeTheLease()
      await clearUp()
      const fresh = await anUnfinishedEpisode('uploaded')
      await db.update(episodes).set({ createdAt: new Date() }).where(eq(episodes.id, fresh))

      await advancePending()

      const [after] = await db
        .select({ status: episodes.status })
        .from(episodes)
        .where(eq(episodes.id, fresh))

      expect(after?.status).not.toBe('failed')
      await clearUp()
    })

  })
}