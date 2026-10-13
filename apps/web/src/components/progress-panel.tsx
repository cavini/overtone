'use client'

import { useEffect, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'

type Labels = Record<UiKey, string>

export interface Progress {
  /** What it is doing right now, already in the reader's language. */
  readonly headline: string
  readonly done: number
  readonly total: number
  /** When the next attempt is due, as a timestamp. Absent when not waiting. */
  readonly nextAttemptAt?: number
  /** Why it is waiting, from the pipeline's own message. */
  readonly notice?: string
}

const mmss = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Something moving, and a reason.
 *
 * Built because the first version showed only the pipeline's own notice,
 * which says how many minutes until the next attempt. A countdown that
 * restarts every time a chunk lands reads as a loop, not as progress — and
 * that is exactly how it read. What was missing was the part that *was*
 * moving: chunks finished, out of how many.
 */
export function ProgressPanel({
  progress,
  labels,
}: {
  readonly progress: Progress
  readonly labels: Labels
}) {
  const [now, setNow] = useState(() => Date.now())

  // Ticks only while there is something to count down to.
  useEffect(() => {
    if (progress.nextAttemptAt === undefined) return

    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [progress.nextAttemptAt])

  const remaining = progress.nextAttemptAt === undefined ? 0 : progress.nextAttemptAt - now
  const waiting = remaining > 0
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)

  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Spinner />
        <p className="text-sm font-medium">{progress.headline}</p>
      </div>

      {progress.total > 0 ? (
        <>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full"
            style={{ background: 'var(--edge)' }}
            role="progressbar"
            aria-valuenow={progress.done}
            aria-valuemin={0}
            aria-valuemax={progress.total}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${percent}%`, background: 'var(--accent)' }}
            />
          </div>
          <p className="tabular mt-2 text-xs" style={{ color: 'var(--quiet)' }}>
            {progress.done} / {progress.total} {labels.partsDone}
          </p>
        </>
      ) : null}

      {waiting ? (
        <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--edge)' }}>
          <p className="text-sm">
            {labels.nextPartIn} <span className="tabular font-medium">{mmss(remaining)}</span>
          </p>
          {/*
            * This said "keep this tab open" next to "nothing for you to
            * do", which is both a contradiction and wrong. It predates the
            * scheduler: `advancePending` carries the episode a step every
            * minute, which is the whole reason that exists.
            *
            * Only true here. The block is the wait for the allowance to
            * refill, which happens *after* the browser has finished
            * uploading — the upload itself needs the file, so it needs the
            * tab.
            */}
          <p className="mt-1 text-xs" style={{ color: 'var(--quiet)' }}>
            {labels.continuesAlone} {labels.canCloseTheTab}
          </p>
        </div>
      ) : null}
    </section>
  )
}

/** Turns, so the page is visibly alive while nothing else changes. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2"
      style={{ borderColor: 'var(--edge)', borderTopColor: 'var(--accent)' }}
    />
  )
}
