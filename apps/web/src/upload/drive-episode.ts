import type { Locale } from '@overtone/messages'
import type { AnalysisView, OutcomeView } from '../presenter/episode-view.js'
import { MAX_SLEEP_MS, readJson } from './read-json.js'

/**
 * Carries an episode to the end, one chunk a step.
 *
 * Lifted out of the upload form, where it sat inside a 486-line component
 * with no test of any kind. The seams are the same ones the rest of this
 * repo uses: `fetch` is injected the way `GroqTranscriptionProvider` takes
 * it, and the clock is injected because `Date.now()` in here is a value a
 * test cannot predict. Nothing about it needs a browser, so it is tested
 * with the suite that already exists rather than a React one.
 *
 * It reports a **phase**, never a sentence. No layer below the presenter
 * knows which language the reader wants (ADR 0017), and the version inside
 * the component put `labels.waitingForAllowance` straight into this logic.
 *
 * A function rather than a loop inside the upload, because finishing an
 * episode and resuming one are the same work. Resuming is needed at all
 * because the browser drives this and browsers get closed.
 */

/** How long to wait when the scheduler holds the lease and says nothing. */
const DEFAULT_RETRY_MS = 3_000

export type DriveState =
  | {
      readonly phase: 'transcribing'
      readonly done: number
      readonly total: number
      readonly notice?: string
    }
  | {
      readonly phase: 'waiting'
      readonly done: number
      readonly total: number
      /** Epoch milliseconds, from the injected clock. */
      readonly nextAttemptAt: number
      readonly notice?: string
    }
  | { readonly phase: 'finished' }

export interface DriveHandlers {
  readonly onState: (state: DriveState) => void
  readonly onResult: (result: {
    readonly status: OutcomeView
    readonly analysis?: AnalysisView
  }) => void
  readonly onError: (message: string) => void
  /**
   * Told however the drive ended, including on a refusal.
   *
   * The transcript keeps asking for more for as long as it is told the
   * episode is live, and it was once never told otherwise: a finished
   * upload left a request every five seconds running for as long as the tab
   * stayed open.
   */
  readonly onSettled: (episodeId: string) => void
}

export interface DriveDeps {
  readonly fetch: typeof globalThis.fetch
  readonly sleep: (ms: number) => Promise<void>
  readonly now: () => number
}

export async function driveEpisode(
  episode: { readonly episodeId: string; readonly chunkCount: number; readonly locale: Locale },
  handlers: DriveHandlers,
  deps: DriveDeps,
): Promise<void> {
  const { episodeId, chunkCount, locale } = episode

  try {
    for (;;) {
      const response = await deps.fetch('/api/episodes/advance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ episodeId, locale }),
      })

      const payload = await readJson(response)
      if (!response.ok || payload['error'] !== undefined) {
        handlers.onError(String(payload['error'] ?? 'UNEXPECTED'))
        return
      }

      /*
       * The schedule is mid-step on this very episode. Both drive the same
       * loop (ADR 0027) and they take turns under one lease, so this is not
       * an error and not progress — it is "ask again shortly". There is no
       * status to read, and reading one would be reading `undefined`.
       */
      if (payload['busy'] === true) {
        await deps.sleep(Math.min(Number(payload['retryAfterMs'] ?? DEFAULT_RETRY_MS), MAX_SLEEP_MS))
        continue
      }

      const status = payload['status'] as OutcomeView
      const analysis = payload['analysis'] as AnalysisView | undefined
      handlers.onResult(analysis === undefined ? { status } : { status, analysis })

      if (status.done) {
        handlers.onState({ phase: 'finished' })
        return
      }

      const waitMs = Number(payload['retryAfterMs'] ?? 0)
      const done = Number(payload['chunksDone'] ?? 0)
      // Falls back to what the caller already knew, so an answer that omits
      // the count does not reset the bar to zero of zero.
      const total = Number(payload['chunkCount'] ?? chunkCount)
      const notice = status.notice === undefined ? {} : { notice: status.notice }

      handlers.onState(
        waitMs > 0
          ? { phase: 'waiting', done, total, nextAttemptAt: deps.now() + waitMs, ...notice }
          : { phase: 'transcribing', done, total, ...notice },
      )

      await deps.sleep(Math.min(waitMs, MAX_SLEEP_MS))
    }
  } catch (caught) {
    handlers.onError(caught instanceof Error ? caught.message : 'UNEXPECTED')
  } finally {
    handlers.onSettled(episodeId)
  }
}
