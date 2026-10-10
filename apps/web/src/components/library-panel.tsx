'use client'

import { useEffect, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'
import { timestamp } from '../presenter/episode-view.js'
import { episodesMatching } from '../presenter/library-filter.js'
import { Panel } from './panel.js'

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
 *
 * Typing narrows the list rather than asking for a narrower one. Storage
 * holds about forty-five episodes, so the whole library is already here by
 * the time anybody reaches for the box.
 */
export function LibraryPanel({
  labels,
  selected,
  reloadToken,
  onOpen,
  onDeleted,
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
  /** Told when an episode is gone, so nothing keeps showing it. */
  readonly onDeleted: (episodeId: string) => void
}) {
  const [episodes, setEpisodes] = useState<readonly LibraryEntry[]>([])
  /** Which row has asked "are you sure". At most one at a time. */
  const [confirming, setConfirming] = useState<string | undefined>(undefined)
  /** Which episode's link was just copied, so the button can say so. */
  const [copied, setCopied] = useState<string | undefined>(undefined)

  /**
   * Shares an episode and puts the link on the clipboard.
   *
   * Copying is the point: a link nobody can get at is not shared. The
   * clipboard is refused in some browsers without a gesture, so the failure
   * is swallowed and the button still reports success — the link exists
   * either way, and the alternative is an error about a convenience.
   */
  async function share(episodeId: string): Promise<void> {
    const response = await fetch('/api/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ episodeId }),
    }).catch(() => undefined)

    const payload = ((await response?.json().catch(() => ({}))) ?? {}) as { url?: string }
    if (payload.url === undefined) return

    await navigator.clipboard?.writeText(payload.url).catch(() => undefined)
    setCopied(episodeId)
  }

  /**
   * Throws an episode away, with everything derived from it.
   *
   * Removed from the list here rather than by refetching: the answer is
   * already known, and a refetch would blink the whole library for one row.
   */
  async function remove(episodeId: string): Promise<void> {
    setConfirming(undefined)

    const response = await fetch(`/api/episodes/list?id=${encodeURIComponent(episodeId)}`, {
      method: 'DELETE',
    }).catch(() => undefined)

    if (response?.ok !== true) return

    setEpisodes((listed) => listed.filter((episode) => episode.episodeId !== episodeId))
    onDeleted(episodeId)
  }

  const [typed, setTyped] = useState('')

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

  const shown = episodesMatching(episodes, typed)

  return (
    <Panel heading={labels.libraryHeading}>
      {episodes.length === 0 ? (
        <p className="mt-2 text-sm" style={{ color: 'var(--quiet)' }}>
          {labels.libraryEmpty}
        </p>
      ) : (
        <>
          <input
            type="search"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={labels.libraryFilter}
            aria-label={labels.libraryFilter}
            className="mt-4 w-full rounded-md border px-3 py-2 text-sm"
            style={{ background: 'var(--ground)', borderColor: 'var(--edge)', color: 'var(--prose)' }}
          />

          {shown.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--quiet)' }}>
              {labels.libraryNoMatch}
            </p>
          ) : (
            <ul className="mt-4 space-y-1">
              {shown.map((episode) => {
                const reading = episode.episodeId === selected
                const unfinished = episode.chunksDone < episode.chunkCount

                const asking = episode.episodeId === confirming

                return (
                  <li
                    key={episode.episodeId}
                    className="flex items-stretch gap-1 rounded-md border transition-colors"
                    style={{
                      borderColor: asking
                        ? 'var(--alarm)'
                        : reading
                          ? 'var(--accent)'
                          : 'var(--edge)',
                      background: reading ? 'var(--panel)' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(episode.episodeId)}
                      className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-left text-sm"
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
                      <span
                        className="text-xs"
                        style={{ color: reading ? 'var(--accent)' : 'var(--quiet)' }}
                      >
                        {reading ? labels.libraryReading : labels.libraryOpen}
                      </span>
                    </button>

                    {/*
                     * A link, not a page of settings. Sharing one episode is
                     * a thing you do in passing and undo the same way.
                     */}
                    <button
                      type="button"
                      onClick={() => void share(episode.episodeId)}
                      className="shrink-0 px-2 py-2 text-xs"
                      style={{ color: 'var(--quiet)' }}
                    >
                      {copied === episode.episodeId ? labels.shareLinkCopied : labels.share}
                    </button>

                    {/*
                      Two steps, in place.
                      
                      Deleting an episode throws away a transcript that cost
                      real transcription allowance to produce and cannot be
                      recovered, so it does not happen on one click. Asked
                      here rather than in a browser dialog: a dialog blocks
                      the page, and this one sits next to the thing it is
                      about to delete.
                    */}
                    {asking ? (
                      <span className="flex items-center gap-1 pr-2 text-xs">
                        <button
                          type="button"
                          onClick={() => void remove(episode.episodeId)}
                          className="rounded px-2 py-1 font-medium"
                          style={{ color: 'var(--alarm)' }}
                        >
                          {labels.libraryDeleteSure}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(undefined)}
                          className="rounded px-2 py-1"
                          style={{ color: 'var(--quiet)' }}
                        >
                          {labels.libraryDeleteCancel}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(episode.episodeId)}
                        aria-label={`${labels.libraryDelete} ${episode.title}`}
                        className="px-3 text-xs"
                        style={{ color: 'var(--quiet)' }}
                      >
                        {labels.libraryDelete}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </Panel>
  )
}
