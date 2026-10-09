import type { AllowanceState } from '../domain/allowance.js'

/**
 * What of the transcription allowance has been spent.
 *
 * Shared across every user of the app, not per-episode and not per-person:
 * the free tier counts seconds of audio against one account. Two people
 * uploading at once are spending the same budget, which is why this is a
 * store rather than a value carried through a request.
 */
export interface AllowanceStore {
  read(): Promise<AllowanceState>
  /** Records audio sent, so the next decision sees it. */
  record(audioMs: number): Promise<void>
}
