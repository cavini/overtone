import { describe, expect, it } from 'vitest'
import { HOURLY_ALLOWANCE_MS } from '../analysis/pacing.js'
import type { ObservedAllowance } from '../domain/observed-allowance.js'
import type { AllowanceStore } from '../ports/allowance-store.js'

/** What a test must provide to be held to this contract. */
export interface AllowanceStoreUnderTest {
  readonly store: AllowanceStore
  /**
   * The clock the implementation stamps balances with, so the contract can
   * reason about elapsed time without importing a timer into a package that
   * has none. It must advance — a store held to this contract is one whose
   * balance genuinely goes stale.
   */
  now(): number
  /** Returns the shared row to untouched. */
  reset(): Promise<void>
  teardown?(): Promise<void>
}

/**
 * Waits for the clock to tick over, bounded so a stopped clock fails the test
 * rather than hanging the suite.
 */
function awaitTick(now: () => number): number {
  const started = now()
  for (let spins = 0; spins < 100_000_000; spins += 1) {
    const current = now()
    if (current > started) return current
  }
  return started
}

const CHUNK = 20 * 60_000

const reading = (remainingAudioMs: number): ObservedAllowance => ({
  remainingAudioMs,
  limitAudioMs: HOURLY_ALLOWANCE_MS,
  refillsFullyInMs: (HOURLY_ALLOWANCE_MS - remainingAudioMs) / 2,
})

/**
 * The contract every `AllowanceStore` has to satisfy, fake included.
 *
 * The whole suite trusts the fakes. A fake that behaves differently from the
 * real adapter makes every test that uses it pass for the wrong reason, so
 * both are held to this one description of the behaviour.
 *
 * It says nothing about *how* the balance is kept — one does arithmetic in
 * SQL, the other in memory — only about what any caller is entitled to
 * assume.
 */
export function describeAllowanceStore(
  name: string,
  setUp: () => Promise<AllowanceStoreUnderTest>,
): void {
  describe(`${name} (AllowanceStore contract)`, () => {
    const withStore = async (
      body: (store: AllowanceStore) => Promise<void>,
    ): Promise<void> => {
      const subject = await setUp()
      await subject.reset()
      try {
        await body(subject.store)
      } finally {
        await subject.teardown?.()
      }
    }

    it('starts with a full balance', async () => {
      await withStore(async (store) => {
        const state = await store.read()

        expect(state.remainingAudioMs).toBe(HOURLY_ALLOWANCE_MS)
        expect(state.dailyUsedMs).toBe(0)
      })
    })

    it('reduces the balance by what was sent', async () => {
      await withStore(async (store) => {
        await store.record(CHUNK)

        // At least the subtraction. More is allowed: time passes during the
        // call and the bucket refills, so an implementation reading a real
        // clock lands slightly above.
        const { remainingAudioMs } = await store.read()
        expect(remainingAudioMs).toBeGreaterThanOrEqual(HOURLY_ALLOWANCE_MS - CHUNK)
        expect(remainingAudioMs).toBeLessThan(HOURLY_ALLOWANCE_MS)
      })
    })

    it('adds up what the day has spent', async () => {
      await withStore(async (store) => {
        await store.record(CHUNK)
        await store.record(CHUNK)

        expect((await store.read()).dailyUsedMs).toBe(2 * CHUNK)
      })
    })

    // The balance is only true at an instant, so the stamp has to move with
    // it. A stamp left at its old value is worse than useless: pacing credits
    // refill for the whole gap *before* the spend, which hands back the audio
    // that was just sent.
    it('restamps the balance when a spend is recorded', async () => {
      const subject = await setUp()
      await subject.reset()
      try {
        /*
         * Two stamps the store itself wrote, never one of its and one of
         * this machine's.
         *
         * The real store stamps a stored row with the database's `now()` —
         * a clock on another continent, measured at three milliseconds
         * behind this laptop, which is enough to fail a comparison against
         * `Date.now()` on every run. An empty bucket is stamped locally, so
         * even the store's own first answer is from the wrong clock until
         * something has been recorded. Hence recording twice.
         */
        await subject.store.record(CHUNK)
        const before = (await subject.store.read()).asOfMs

        // The clock has to have moved, or a stamp that never moved is
        // indistinguishable from one set a moment ago.
        awaitTick(() => subject.now())
        await subject.store.record(CHUNK)

        expect((await subject.store.read()).asOfMs).toBeGreaterThan(before)
      } finally {
        await subject.teardown?.()
      }
    })

    describe('when the provider reports its own balance', () => {
      it('believes the provider over its own arithmetic', async () => {
        await withStore(async (store) => {
          await store.record(CHUNK, reading(5_473_000))

          expect((await store.read()).remainingAudioMs).toBe(5_473_000)
        })
      })

      // The provider reports nothing about the day, so that tally stays ours
      // whatever it says about the hour.
      it('still counts the spend against the day', async () => {
        await withStore(async (store) => {
          await store.record(CHUNK, reading(5_473_000))

          expect((await store.read()).dailyUsedMs).toBe(CHUNK)
        })
      })

      it('accepts a report of an empty balance', async () => {
        await withStore(async (store) => {
          await store.record(CHUNK, reading(0))

          expect((await store.read()).remainingAudioMs).toBe(0)
        })
      })
    })

    it('never reports a negative balance', async () => {
      await withStore(async (store) => {
        await store.record(HOURLY_ALLOWANCE_MS * 3)

        expect((await store.read()).remainingAudioMs).toBe(0)
      })
    })

    it('never reports more than a full balance', async () => {
      await withStore(async (store) => {
        await store.record(CHUNK, reading(HOURLY_ALLOWANCE_MS))

        expect((await store.read()).remainingAudioMs).toBeLessThanOrEqual(HOURLY_ALLOWANCE_MS)
      })
    })

    // One account, one budget. Two uploads at once spend the same balance, so
    // an implementation that reads then writes back loses one of the two and
    // lets the pair send more audio than the allowance permits.
    it('loses nothing when spends land at once', async () => {
      await withStore(async (store) => {
        await Promise.all(Array.from({ length: 10 }, () => store.record(60_000)))

        expect((await store.read()).dailyUsedMs).toBe(10 * 60_000)
      })
    })
  })
}
