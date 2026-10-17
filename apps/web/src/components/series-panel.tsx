'use client'

import type {
  SeriesOverview,
  SeriesTermTotal,
  SeriesTopicTrend,
  TopicTrend,
} from '@overtone/core'
import type { Locale } from '@overtone/messages'
import { useEffect, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'
import { number, timestamp } from '../presenter/episode-view.js'
import { topicBars } from '../presenter/series-bars.js'
import { Panel } from './panel.js'

type Labels = Record<UiKey, string>

/** Which label explains an arrow, so the arrow is never the only thing said. */
const TREND_LABEL: Record<TopicTrend, UiKey> = {
  up: 'trendUp',
  down: 'trendDown',
  flat: 'trendFlat',
  unknown: 'trendUnknown',
}

const TREND_MARK: Record<TopicTrend, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
  unknown: '·',
}

/**
 * The series, rather than the episode.
 *
 * The thing the product is actually for. One episode's word counts are mildly
 * interesting; *"we said it four times more this month than last"* is what
 * brings anyone back. The engine for it has been in `packages/core` with its
 * own tests since early on, and nothing on the page could reach it.
 */
export function SeriesPanel({
  locale,
  labels,
  reloadToken,
}: {
  readonly locale: Locale
  readonly labels: Labels
  /** Bumped when an episode lands or goes, so the totals do not go stale. */
  readonly reloadToken: number
}) {
  const [overview, setOverview] = useState<SeriesOverview | undefined>(undefined)

  useEffect(() => {
    let stopped = false

    const pull = async (): Promise<void> => {
      const response = await fetch('/api/series').catch(() => undefined)
      if (stopped || response === undefined || !response.ok) return

      const payload = (await response.json()) as SeriesOverview
      if (!stopped) setOverview(payload)
    }

    void pull()
    return () => {
      stopped = true
    }
  }, [reloadToken])

  if (overview === undefined) return null

  return (
    <Panel heading={labels.seriesHeading}>
      {overview.state === 'empty' ? (
        <p className="mt-2 text-sm" style={{ color: 'var(--quiet)' }}>
          {labels.seriesEmpty}
        </p>
      ) : (
        <>
          <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-3">
            <Figure
              label={labels.seriesEpisodeCount}
              value={number(overview.readyCount, locale)}
              note={
                overview.processingCount > 0
                  ? `${number(overview.processingCount, locale)} ${labels.seriesProcessing}`
                  : undefined
              }
            />
            <Figure label={labels.seriesTotalTime} value={timestamp(overview.totalDurationMs)} />
            <Figure label={labels.seriesTotalWords} value={number(overview.totalWords, locale)} />
          </dl>

          {overview.state === 'first-episode' ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--quiet)' }}>
              {labels.seriesFirstEpisode}
            </p>
          ) : null}

          {overview.topics.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--quiet)' }}>
              {labels.seriesNoTopics}
            </p>
          ) : (
            <ul className="mt-5 flex flex-col gap-4">
              {overview.topics.map((topic) => (
                <TopicRow key={topic.topicId} topic={topic} locale={locale} labels={labels} />
              ))}
            </ul>
          )}

          <TopWords locale={locale} labels={labels} reloadToken={reloadToken} />
        </>
      )}
    </Panel>
  )
}

/** One number, and what it counts. */
function Figure({
  label,
  value,
  note,
}: {
  readonly label: string
  readonly value: string
  readonly note?: string | undefined
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--quiet)' }}>
        {label}
      </dt>
      <dd className="text-2xl tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
        {note === undefined ? null : (
          <span className="ml-2 text-xs" style={{ color: 'var(--quiet)' }}>
            {note}
          </span>
        )}
      </dd>
    </div>
  )
}

/** One running joke, across every episode. */
function TopicRow({
  topic,
  locale,
  labels,
}: {
  readonly topic: SeriesTopicTrend
  readonly locale: Locale
  readonly labels: Labels
}) {
  const bars = topicBars(topic.perEpisode)

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{topic.topicName}</span>
        <span className="text-sm tabular-nums" style={{ color: 'var(--quiet)' }}>
          {number(topic.total, locale)}
          <span
            className="ml-2"
            title={labels[TREND_LABEL[topic.trend]]}
            aria-label={labels[TREND_LABEL[topic.trend]]}
            style={{ color: topic.trend === 'unknown' ? 'var(--quiet)' : 'var(--accent)' }}
          >
            {TREND_MARK[topic.trend]}
          </span>
        </span>
      </div>

      {/*
       * Columns, oldest on the left, so the series reads the way it was
       * recorded. Each is labelled with its own episode and count — a
       * sparkline nobody can read a number off is decoration.
       */}
      <ol className="mt-2 flex h-10 items-end gap-0.5" aria-label={labels.seriesPerEpisode}>
        {bars.map((bar) => (
          <li
            key={bar.episodeNumber}
            title={`#${bar.episodeNumber}: ${number(bar.count, locale)}`}
            /*
             * Capped, or a series of two draws two slabs half the page wide.
             * Columns grow to fill the row as episodes accumulate and stop
             * at a width that still reads as a column rather than a block.
             */
            className="min-w-1 max-w-4 flex-1 rounded-xs"
            style={{
              height: `${bar.height}%`,
              background: bar.count === 0 ? 'var(--edge)' : 'var(--accent)',
            }}
          />
        ))}
      </ol>
    </li>
  )
}

/**
 * The words the series says most, folded away.
 *
 * Collapsed because it is a reference table and the page above it is about
 * what changed — twenty-five rows of totals would push that off the screen.
 * `<details>` rather than state, so it folds before any JavaScript arrives.
 *
 * **Asked for on the first open, and not before.** The totals are stored,
 * rebuilt when an episode finishes analysis, so reading them is a cheap
 * indexed select — but the panel above is fetched on every page load and
 * again after every upload, and a table nobody has opened should not be
 * fetched on their behalf. Kept once fetched: it cannot change while the
 * page is open except by an upload, which moves `reloadToken`.
 */
function TopWords({
  locale,
  labels,
  reloadToken,
}: {
  readonly locale: Locale
  readonly labels: Labels
  readonly reloadToken: number
}) {
  const [terms, setTerms] = useState<readonly SeriesTermTotal[] | undefined>(undefined)
  const [asking, setAsking] = useState(false)

  // Dropped when an upload lands, so the next open asks again rather than
  // showing totals from before the new episode.
  useEffect(() => {
    setTerms(undefined)
  }, [reloadToken])

  async function open(event: React.SyntheticEvent<HTMLDetailsElement>): Promise<void> {
    if (!event.currentTarget.open || terms !== undefined || asking) return

    setAsking(true)
    try {
      const response = await fetch('/api/series/words').catch(() => undefined)
      const payload = ((await response?.json().catch(() => ({}))) ?? {}) as {
        terms?: readonly SeriesTermTotal[]
      }
      setTerms(payload.terms ?? [])
    } finally {
      setAsking(false)
    }
  }

  return (
    <details
      onToggle={(event) => void open(event)}
      className="mt-6 rounded-lg border"
      style={{ borderColor: 'var(--edge)' }}
    >
      <summary className="px-4 py-3 text-sm font-medium">{labels.seriesTopWords}</summary>

      <p className="px-4 text-xs" style={{ color: 'var(--quiet)' }}>
        {labels.seriesTopWordsHint}
      </p>

      {terms === undefined ? (
        <p className="px-4 pb-4 pt-3 text-sm" style={{ color: 'var(--quiet)' }}>
          {labels.seriesCountingWords}
        </p>
      ) : terms.length === 0 ? (
        <p className="px-4 pb-4 pt-3 text-sm" style={{ color: 'var(--quiet)' }}>
          {labels.seriesNoTopics}
        </p>
      ) : (
        /* Its own scroller, so a long word never makes the page scroll sideways. */
        <div className="overflow-x-auto px-4 pb-4">
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--quiet)' }}>
                <th scope="col" className="text-left font-normal">
                  {labels.seriesWord}
                </th>
                {/* Right-aligned and tabular, so the digits line up. */}
                <th scope="col" className="text-right font-normal">
                  {labels.seriesWordTotal}
                </th>
                <th scope="col" className="text-right font-normal">
                  {labels.seriesWordEpisodes}
                </th>
              </tr>
            </thead>
            <tbody>
              {terms.map((entry) => (
                <tr key={entry.term}>
                  <th scope="row" className="py-1 text-left font-normal">
                    {entry.term}
                    {/*
                     * Said where it is true, because a stemmed grouping is a
                     * guess — Portuguese stemmers fold `comer` into `com` —
                     * and a total resting on one should not read as solidly
                     * as a total that does not.
                     */}
                    {entry.heuristic ? (
                      <span className="ml-2 text-xs" style={{ color: 'var(--quiet)' }}>
                        {labels.seriesWordGuessed}
                      </span>
                    ) : null}
                  </th>
                  <td className="tabular py-1 text-right font-medium">
                    {number(entry.total, locale)}
                  </td>
                  {/*
                   * The honest half of the number: four thousand across
                   * twenty-three episodes is how we talk, the same total in
                   * one episode is one conversation.
                   */}
                  <td className="tabular py-1 text-right" style={{ color: 'var(--quiet)' }}>
                    {number(entry.episodes, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}
