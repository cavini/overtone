// US-041 · an episode finishes whether or not anyone is watching
//
// Skipped without DATABASE_URL, because CI has no database.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { advancePending } from './advance-pending.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  describe('advancePending', () => {
    it.skip('needs DATABASE_URL', () => {})
  })
} else {
  const other = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
  const freeTheLease = () => other`update advance_lease set held_until = now()`

  afterAll(async () => {
    await freeTheLease()
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


  })
}
