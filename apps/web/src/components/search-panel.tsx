'use client'

import { useState } from 'react'
import type { UiKey } from '../i18n/ui.js'
import { timestamp } from '../presenter/episode-view.js'

type Labels = Record<UiKey, string>

interface Moment {
  readonly episodeId: string
  readonly episodeNumber: number
  readonly episodeTitle: string
  readonly startMs: number
  readonly endMs: number
  readonly hitCount: number
  readonly quote: string
}

/**
 * Finding the bit where they talked about something.
 *
 * Results are *moments*, not matches. Transcript segments run about three
 * seconds, so a real conversation produces a cluster of them, and a list of
 * timestamps two seconds apart answers the question with noise. The one
 * someone wants is usually the longest stretch, so that is first.
 */
export function SearchPanel({ labels }: { readonly labels: Labels }) {
  const [query, setQuery] = useState('')
  const [moments, setMoments] = useState<readonly Moment[] | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  async function run(): Promise<void> {
    if (query.trim().length === 0) return

    setBusy(true)
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      const payload = (await response.json()) as { moments?: Moment[] }
      setMoments(payload.moments ?? [])
    } catch {
      setMoments([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="mt-6 rounded-xl border p-5"
      style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
    >
      <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>
        {labels.searchHeading}
      </h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--quiet)' }}>
        {labels.searchHint}
      </p>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run()
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchHeading}
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          style={{ background: 'var(--ground)', borderColor: 'var(--edge)', color: 'var(--prose)' }}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: 'var(--accent)', color: 'var(--ground)' }}
        >
          {busy ? labels.searching : labels.searchButton}
        </button>
      </form>

      <p className="mt-2 text-xs" style={{ color: 'var(--quiet)' }}>
        {labels.searchFree}
      </p>

      {moments !== undefined ? (
        moments.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: 'var(--quiet)' }}>
            {labels.searchNothing}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {moments.map((moment) => (
              <li
                key={`${moment.episodeId}-${moment.startMs}`}
                className="rounded-md border px-3 py-2"
                style={{ borderColor: 'var(--edge)' }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {moment.episodeTitle}{' '}
                    <span className="tabular" style={{ color: 'var(--accent)' }}>
                      {timestamp(moment.startMs)}
                    </span>
                  </span>
                  <span className="tabular text-xs" style={{ color: 'var(--quiet)' }}>
                    {moment.hitCount} {labels.mentionsHere}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--quiet)' }}>
                  {moment.quote.length > 220 ? `${moment.quote.slice(0, 220)}…` : moment.quote}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}
