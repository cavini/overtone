'use client'

import { useEffect, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'
import { timestamp } from '../presenter/episode-view.js'
import { episodesMatching } from '../presenter/library-filter.js'
import { groupedByCategory } from '../presenter/library-sections.js'
import { libraryRowState } from '../presenter/library-row-state.js'
import { renderMessage, type Locale } from '@overtone/messages'
import { ConfirmDialog } from './confirm-dialog.js'
import { Panel } from './panel.js'
import { Spinner } from './spinner.js'
import { TrashCan } from './trash-can.js'

type Labels = Record<UiKey, string>

export interface LibraryEntry {
  readonly episodeId: string
  readonly number: number
  readonly title: string
  readonly durationMs: number
  readonly chunksDone: number
  readonly chunkCount: number
  /**
   * Where the episode got to.
   *
   * `/api/episodes/list` has always sent this; this type dropped it, so the
   * row had nothing to go on but the chunk counts and drew a failed episode
   * as a working one. See `libraryRowState`.
   */
  readonly status: string
  /**
   * Which programme it is, so the list can read in sections.
   *
   * Null for an episode whose filename carried no number — a loose upload
   * rather than part of a show.
   */
  readonly category: string | null
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
  locale,
  labels,
  selected,
  reloadToken,
  onOpen,
  onDeleted,
}: {
  readonly locale: Locale
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

  /**
   * Puts a failed episode back in the queue.
   *
   * Only the chunks that never came back are re-transcribed — the ones in
   * hand are kept — so this is cheap enough not to need confirming, unlike
   * the trash can beside it.
   *
   * The row is moved here rather than refetched, for the same reason
   * deletion is: the answer is already known, and a refetch would blink the
   * whole library for one row. `transcribing` is what the scheduler will
   * pick up, so that is what the row should say.
   */
  async function retry(episodeId: string): Promise<void> {
    const response = await fetch('/api/episodes/retry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ episodeId }),
    }).catch(() => undefined)

    if (response?.ok !== true) return

    setEpisodes((listed) =>
      listed.map((episode) =>
        episode.episodeId === episodeId ? { ...episode, status: 'transcribing' } : episode,
      ),
    )
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

  /*
   * Grouped after filtering, not before: typing narrows the library, and a
   * programme whose every episode was filtered out should take its heading
   * with it rather than sit there empty.
   */
  const sections = groupedByCategory(shown)

  // Only worth headings when there is something to tell apart. A library
  // that is all one show would otherwise grow a title that says nothing.
  const named = sections.length > 1

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
            sections.map((section) => (
              <section key={section.category ?? ''}>
                {named ? (
                  <h3
                    className="mt-4 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--quiet)' }}
                  >
                    {section.category ?? labels.libraryUncategorised}
                  </h3>
                ) : undefined}
                <ul className="mt-2 space-y-1">
              {section.episodes.map((episode) => {
                const reading = episode.episodeId === selected
                const rowState = libraryRowState(episode.status)

                const asking = episode.episodeId === confirming

                return (
                  <li
                    key={episode.episodeId}
                    /*
                     * Wraps on a phone, so the title keeps its own line.
                     *
                     * Three actions and a title on one row needs about four
                     * hundred pixels. Measured at 360: the row overflowed
                     * and the title button was squeezed to twenty-four
                     * pixels, which is an episode you cannot read the name
                     * of. The actions drop underneath instead.
                     */
                    className="flex flex-wrap items-stretch gap-1 rounded-md border transition-colors"
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
                      className="flex min-w-0 flex-1 basis-full flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-left text-sm sm:basis-auto"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{episode.title}</span>
                        <span className="tabular ml-2 text-xs" style={{ color: 'var(--quiet)' }}>
                          {timestamp(episode.durationMs)}
                        </span>
                      </span>
                      {/*
                        A spinner while it is still being transcribed, the
                        word for it when it gave up, and nothing at all once
                        it is done. The row already says which episode is
                        open, by being the one with a border around it — a
                        word for that was both redundant and, as "Lendo",
                        ambiguous about who was doing the reading.

                        The chunk count stays, and stays in both. It is not a
                        label for a state, it is how far along a job is, and
                        on a two-hour episode that is the difference between
                        "working" and "nearly there" — or, on a failure,
                        between losing the episode and losing the tail of it.
                      */}
                      {rowState === 'nothing' ? null : (
                        <span
                          className="flex shrink-0 items-center gap-2 text-xs"
                          style={{
                            color:
                              rowState === 'failed' ? 'var(--danger)' : 'var(--accent-quiet)',
                          }}
                        >
                          <span className="tabular">
                            {episode.chunksDone}/{episode.chunkCount}
                          </span>
                          {rowState === 'failed' ? (
                            <span>{labels.libraryFailed}</span>
                          ) : (
                            <Spinner label={labels.transcribing} />
                          )}
                        </span>
                      )}
                    </button>
                    {/*
                      Beside the trash can rather than in the row's own
                      button, which a button cannot nest inside. Only on a
                      row that gave up: there is nothing to retry otherwise.
                    */}
                    {rowState === 'failed' ? (
                      <button
                        type="button"
                        onClick={() => void retry(episode.episodeId)}
                        className="mr-1 shrink-0 self-center rounded-md px-2 py-1 text-xs"
                        style={{ background: 'var(--accent)', color: 'var(--panel)' }}
                      >
                        {labels.libraryRetry}
                      </button>
                    ) : null}
                    {/*
                      A trash can, in red, and the question in a dialog.
                      It was two words of text in the row, which read as
                      part of the row rather than as the dangerous thing it
                      is — and the confirmation sat in the row too, so the
                      row changed shape under the cursor.
                    */}
                    <button
                      type="button"
                      onClick={() => setConfirming(episode.episodeId)}
                      aria-label={`${labels.libraryDelete} ${episode.title}`}
                      title={labels.libraryDelete}
                      // `self-center`, or the row's stretch makes it a
                      // tall rectangle rather than the square it looks like
                      // in isolation.
                      className="mr-2 shrink-0 self-center rounded-md p-1.5"
                      style={{ background: 'var(--danger)', color: '#fff' }}
                    >
                      <TrashCan />
                    </button>
                  </li>
                )
              })}
                </ul>
              </section>
            ))
          )}
        </>
      )}
      {/*
        * One dialog for the whole list, not one per row. `confirming` holds
        * which episode is being asked about, so the markup does not multiply
        * with the library.
        */}
      <ConfirmDialog
        open={confirming !== undefined}
        question={renderMessage(locale, 'DELETE_EPISODE_CONFIRMATION', {
          title: episodes.find((episode) => episode.episodeId === confirming)?.title ?? '',
        })}
        confirm={labels.libraryDeleteSure}
        cancel={labels.libraryDeleteCancel}
        onCancel={() => setConfirming(undefined)}
        onConfirm={() => {
          if (confirming !== undefined) void remove(confirming)
        }}
      />
    </Panel>
  )
}
