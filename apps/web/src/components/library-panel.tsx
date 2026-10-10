'use client'

import { useEffect, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'
import { timestamp } from '../presenter/episode-view.js'

type Labels = Record<UiKey, string>

export interface LibraryEntry {
  readonly episodeId: string
  readonly number: number
  readonly title: string
  readonly durationMs: number
  readonly status: string
  readonly chunksDone: number
  readonly chunkCount: number
}

/**
 * Every episode, so one can be chosen and read.
 *
 * Without this the page could only ever show the transcript of whichever
 * episode was touched last, which made a series of eleven into ten
 * transcripts nobody could open. Search already named the episode a moment
 * came from; this is what turns that name into something you can click.
 */
export function LibraryPanel({
  labels,
  selected,
  reloadToken,
  onOpen,
}: {
  readonly labels: Labels
  readonly selected: string | undefined
  /**
   * Changes whenever the list behind this panel has moved on — an episode
   * was added, or one reached the end.
   *
   * The list was fetched once, on mount, which meant the episode you had
   * just uploaded was not in the library until the page was reloaded.
   */
  readonly reloadToken: number
  readonly onOpen: (episodeId: string) => void
}) {
  const [episodes, setEpisodes] = useState<readonly LibraryEntry[]>([])

  useEffect(() => {
    let stopped = false

    void (async () => {
      const response = await fetch('/api/episodes/list').catch(() => undefined)
      if (stopped || !response?.ok) return

      const { episodes: found } = (await response.json()) as { episodes: LibraryEntry[] }
      if (!stopped) setEpisodes(found)
    })()

    // A second answer arriving before the first would otherwise be free to
    // put the older list back on screen.
    return () => {
      stopped = true
    }
  }, [reloadToken])

  if (episodes.length === 0) {
    return (
      <section
        className="mt-6 rounded-xl border p-5"
        style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
      >
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>
          {labels.libraryHeading}
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--quiet)' }}>
          {labels.libraryEmpty}
        </p>
      </section>
    )
  }

  return (
    <section
      className="mt-6 rounded-xl border p-5"
      style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
    >
      <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>
        {labels.libraryHeading}
      </h2>

      <ul className="mt-4 space-y-1">
        {episodes.map((episode) => {
          const reading = episode.episodeId === selected
          const unfinished = episode.chunksDone < episode.chunkCount

          return (
            <li key={episode.episodeId}>
              <button
                type="button"
                onClick={() => onOpen(episode.episodeId)}
                className="flex w-full flex-wrap items-baseline justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors"
                style={{
                  borderColor: reading ? 'var(--accent)' : 'var(--edge)',
                  background: reading ? 'var(--panel)' : 'transparent',
                }}
              >
                <span className="min-w-0">
                  <span className="font-medium">{episode.title}</span>
                  <span className="tabular ml-2 text-xs" style={{ color: 'var(--quiet)' }}>
                    {timestamp(episode.durationMs)}
                  </span>
                  {unfinished ? (
                    <span className="ml-2 text-xs" style={{ color: 'var(--accent-quiet)' }}>
                      {episode.chunksDone}/{episode.chunkCount} {labels.libraryUnfinished}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs" style={{ color: reading ? 'var(--accent)' : 'var(--quiet)' }}>
                  {reading ? labels.libraryReading : labels.libraryOpen}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
