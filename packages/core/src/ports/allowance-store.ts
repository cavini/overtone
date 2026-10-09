import type { AllowanceState } from '../domain/allowance.js'
import type { ObservedAllowance } from '../domain/observed-allowance.js'

/**
 * What the transcription allowance can afford.
 *
 * Shared across every user of the app, not per-episode and not per-person:
 * the free tier counts seconds of audio against one account. Two people
 * uploading at once are spending the same budget, which is why this is a
 * store rather than a value carried through a request.
 *
 * It is a cache of somebody else's number. The provider reports its own
 * balance on every response, and that reading always wins over our
 * arithmetic (ADR 0021) — the store exists so the *other* process finds out.
 */
export interface AllowanceStore {
  read(): Promise<AllowanceState>
  /**
   * Records audio sent, so the next decision sees it.
   *
   * `observed` is what the provider said afterwards, when it said anything.
   * Given one, the hourly balance becomes the reported figure rather than our
   * subtraction; the daily tally is ours either way, because the provider
   * does not report it.
   */
  record(spentAudioMs: number, observed?: ObservedAllowance): Promise<void>
}
