'use client'

import { CHUNK_TARGET_MS } from '@overtone/core'
import type { Locale } from '@overtone/messages'
import { useState } from 'react'
import type { UiKey } from '../i18n/ui.js'
import { LibraryPanel } from './library-panel.js'
import { SearchPanel } from './search-panel.js'
import { TranscriptView } from './transcript-view.js'
import { UploadForm } from './upload-form.js'

type Labels = Record<UiKey, string>

interface Showing {
  readonly episodeId: string
  readonly live: boolean
  /** Which part to scroll to, when arriving from a search result. */
  readonly focusChunk?: number
}

/**
 * Holds which episode is on screen, so three things can change it.
 *
 * An upload makes its own episode the one worth watching. The library picks
 * one to read. A search result opens the episode it was found in, at the
 * moment it was found. Before this the transcript belonged to the upload
 * form, which meant a series of eleven episodes was ten transcripts nobody
 * could open.
 */
export function Workspace({
  locale,
  labels,
}: {
  readonly locale: Locale
  readonly labels: Labels
}) {
  const [showing, setShowing] = useState<Showing | undefined>(undefined)
  /*
   * Changed whenever an episode appears or finishes, so the library goes
   * and looks again.
   *
   * An upload used to leave the library a page-reload behind: the episode
   * was in the database within a second of pressing the button and in the
   * list on screen only on the next visit.
   */
  const [reloadToken, setReloadToken] = useState(0)

  return (
    <>
      <UploadForm
        locale={locale}
        labels={labels}
        onEpisode={(episodeId, live) => {
          setShowing((current) =>
            /*
             * A finished episode says so whether or not anyone is still
             * looking at it, because saying so is what stops the polling.
             * Only a live episode is worth pulling the reader away from
             * whatever they went on to open.
             */
            live || current === undefined || current.episodeId === episodeId
              ? { episodeId, live }
              : current,
          )
          setReloadToken((token) => token + 1)
        }}
      />

      <SearchPanel
        labels={labels}
        onOpen={(episodeId, startMs) =>
          setShowing({
            episodeId,
            live: false,
            /*
             * Which part holds that moment.
             *
             * Derived from the chunk size rather than read from the part,
             * because a part knows its index and its words but not where it
             * sat in the episode. Exact for every chunk but the last, which
             * absorbs a short remainder — landing one part early on the tail
             * of an episode is a better failure than not landing at all.
             */
            focusChunk: Math.floor(startMs / CHUNK_TARGET_MS),
          })
        }
      />

      <LibraryPanel
        labels={labels}
        selected={showing?.episodeId}
        reloadToken={reloadToken}
        onOpen={(episodeId) => setShowing({ episodeId, live: false })}
        onDeleted={(episodeId) =>
          // Stop reading an episode that no longer exists. Leaving it on
          // screen would keep polling a transcript for a deleted row.
          setShowing((current) => (current?.episodeId === episodeId ? undefined : current))
        }
      />

      {showing ? (
        <TranscriptView
          episodeId={showing.episodeId}
          labels={labels}
          live={showing.live}
          {...(showing.focusChunk === undefined ? {} : { focusChunk: showing.focusChunk })}
        />
      ) : null}
    </>
  )
}
