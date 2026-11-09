'use client'

import { renderMessage, type Locale } from '@overtone/messages'
import { useState } from 'react'
import type { UiKey } from '../i18n/ui.js'
import { timestamp } from '../presenter/episode-view.js'
import { markedQuote } from '../presenter/marked-quote.js'
import { Panel } from './panel.js'
import { callApi } from '../api/call-api.js'

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
export function SearchPanel({
  locale,
  labels,
  onOpen,
}: {
  /** Which language to render the match count in. Never affects the search. */
  readonly locale: Locale
  readonly labels: Labels
  /** Open this moment in the transcript below. */
  readonly onOpen: (episodeId: string, startMs: number) => void
}) {
  const [query, setQuery] = useState('')
  const [moments, setMoments] = useState<readonly Moment[] | undefined>(undefined)
  /**
   * How many lines matched in all, and whether the list is a sample.
   *
   * The per-episode budget samples across each episode, so a word said two
   * and a half thousand times comes back as a few hundred moments. Without
   * saying so, nothing on the page tells that apart from "this is all there
   * is" — which is the one kind of wrong this product cannot afford.
   */
  const [summary, setSummary] = useState<{ count: number; sampled: boolean } | undefined>(
    undefined,
  )
  const [busy, setBusy] = useState(false)

  async function run(): Promise<void> {
    if (query.trim().length === 0) return

    setBusy(true)
    try {
      const answered = await callApi<{
        moments?: Moment[]
        matchCount?: number
        sampled?: boolean
      }>(`/api/search?q=${encodeURIComponent(query)}`)

      if (!answered.ok) {
        setMoments([])
        setSummary(undefined)
        return
      }

      setMoments(answered.data.moments ?? [])
      setSummary({
        count: answered.data.matchCount ?? 0,
        sampled: answered.data.sampled === true,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel heading={labels.searchHeading} startOpen={false}>
      <p className="mt-1 text-sm text-quiet">
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
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm bg-ground border-edge text-prose"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 bg-accent text-ground"
        >
          {busy ? labels.searching : labels.searchButton}
        </button>
      </form>

      <p className="mt-2 text-xs text-quiet">
        {labels.searchFree}
      </p>

      {moments !== undefined ? (
        moments.length === 0 ? (
          <p className="mt-4 text-sm text-quiet">
            {labels.searchNothing}
          </p>
        ) : (
          <>
            {summary === undefined ? null : (
              <p className="mt-4 text-xs text-quiet">
                {renderMessage(
                  locale,
                  summary.sampled ? 'SEARCH_SHOWING_A_SAMPLE' : 'SEARCH_FOUND_EVERY_ONE',
                  { match_count: summary.count },
                )}
              </p>
            )}
            <ul className="mt-2 space-y-2">
            {moments.map((moment) => (
              <li key={`${moment.episodeId}-${moment.startMs}`}>
                <button
                  type="button"
                  onClick={() => onOpen(moment.episodeId, moment.startMs)}
                  title={labels.openInTranscript}
                  className="w-full rounded-md border px-3 py-2 text-left transition-colors border-edge"
                >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {moment.episodeTitle}{' '}
                    <span className="tabular text-accent">
                      {timestamp(moment.startMs)}
                    </span>
                  </span>
                  <span className="tabular text-xs text-quiet">
                    {moment.hitCount} {labels.mentionsHere}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-quiet">
                  {/*
                    Bolded by the database, which is the only layer that
                    knows which words made this match: the search stems, so
                    "ano" matches "anos". Comparing strings here would bold
                    neither.
                  */}
                  {markedQuote(moment.quote, 220).map((part, index) =>
                    part.matched ? (
                      <strong
                        key={`${moment.episodeId}-${moment.startMs}-${index}`}
                        style={{ color: 'var(--prose)', fontWeight: 600 }}
                      >
                        {part.text}
                      </strong>
                    ) : (
                      <span key={`${moment.episodeId}-${moment.startMs}-${index}`}>{part.text}</span>
                    ),
                  )}
                  {moment.quote.length > 220 ? '…' : ''}
                  </p>
                </button>
              </li>
            ))}
            </ul>
          </>
        )
      ) : null}
    </Panel>
  )
}
