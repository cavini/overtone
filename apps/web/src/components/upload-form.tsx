'use client'

import type { Locale } from '@overtone/messages'
import { useEffect, useId, useRef, useState } from 'react'
import { audioDigest } from '../audio/audio-digest.js'
import { audioTypeOf, FILE_INPUT_ACCEPT } from '../audio/audio-type.js'
import { decodeInBrowser } from '../audio/decode-in-browser.js'
import { measureDuration } from '../audio/measure-duration.js'
import { splitAndUpload, type ChunkTarget } from '../audio/split-and-upload.js'
import { uploadProbes, type ProbeTarget } from '../audio/upload-probes.js'
import { callApi } from '../api/call-api.js'
import { driveEpisode, type DriveState } from '../upload/drive-episode.js'
import { sleep } from '../upload/read-json.js'
import type { UiKey } from '../i18n/ui.js'
import type { AnalysisView, OutcomeView } from '../presenter/episode-view.js'
import { CountsTable, JokeList, StatStrip } from './counts-table.js'
import { Panel } from './panel.js'
import { ProgressPanel, type Progress } from './progress-panel.js'

type Labels = Record<UiKey, string>

interface Result {
  readonly status: OutcomeView
  readonly analysis?: AnalysisView
}

export function UploadForm({
  locale,
  labels,
  onEpisode,
}: {
  readonly locale: Locale
  readonly labels: Labels
  /**
   * Told whenever an episode becomes the one worth looking at, and told
   * again with `live` false once nothing more is coming — which is what
   * stops the transcript asking and gets the library its final status.
   */
  readonly onEpisode: (episodeId: string, live: boolean) => void
}) {
  const fileId = useId()
  const hintId = useId()
  const input = useRef<HTMLInputElement>(null)
  const resumed = useRef(false)
  const [filename, setFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | undefined>(undefined)
  // Which episode is on screen is the workspace's business now, so the
  // library and the search results can change it too.
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | undefined>(undefined)
  /**
   * The title this audio is already filed under, when it turned out to be
   * an episode we have. Undefined when the upload was new.
   */
  const [alreadyHere, setAlreadyHere] = useState<string | undefined>(undefined)

  async function send(file: File): Promise<void> {
    setBusy(true)
    setError('')
    setResult(undefined)
    setAlreadyHere(undefined)
    setProgress({ headline: labels.preparing, done: 0, total: 0 })

    try {
      const contentType = audioTypeOf(file.name, file.type)
      if (contentType === undefined) {
        setError(labels.unsupportedFile)
        return
      }

      const durationMs = await measureDuration(file, contentType)

      // Only numbers and names cross the wire here. The audio goes straight
      // to storage from the browser, because the server cannot accept a file
      // this size — which is also why the fingerprint is taken here.
      const begun = await callApi<Record<string, unknown>>('/api/episodes/start', {
        method: 'POST',
        body: {
          durationMs,
          locale,
          // Whole, extension included: the server reads a presentable title
          // and the episode number out of it.
          title: file.name,
          audioDigest: await audioDigest(file),
        },
      })
      if (!begun.ok) {
        setError(begun.error)
        return
      }
      const started = begun.data

      const episodeId = String(started['episodeId'])

      /*
       * The same audio, whatever it was called this time.
       *
       * Nothing is uploaded and nothing is driven: re-transcribing a
       * two-hour episode spends about a third of a day's free allowance to
       * arrive at the transcript that is already in the database. So the
       * episode is simply opened, and the reader is told why pressing the
       * button did nothing.
       */
      if (started['alreadyHave'] === true) {
        const title = started['title']
        setAlreadyHere(typeof title === 'string' ? title : '')
        onEpisode(episodeId, false)
        return
      }

      const planned = started['chunks'] as ChunkTarget[]
      onEpisode(episodeId, true)

      /*
       * Decoded once, here, rather than inside the split.
       *
       * The language is settled from windows of this same array before any
       * chunk is cut, so the samples are needed before `splitAndUpload`
       * runs and there is no reason to produce them twice — a two-hour
       * episode is 1.46 GB decoded, and a second pass would be a second
       * copy of it.
       */
      const samples = await decodeInBrowser(file)

      /*
       * What the episode is spoken in, taken from the episode.
       *
       * It used to be whatever the interface was set to, which is a fact
       * about the reader (ADR 0022). Three half-minute windows from the
       * middle of the recording are uploaded and listened to instead —
       * never the opening, because the show starts on music with English
       * lyrics and the start of the file answers English every time.
       *
       * Before the chunks, and not caught. Every chunk states the
       * episode's language when it is sent, so cutting them before this
       * settled would transcribe the episode as whatever the row still
       * said.
       */
      setProgress({ headline: labels.listeningForLanguage, done: 0, total: 0 })
      await uploadProbes(samples, started['probes'] as ProbeTarget[])

      const heard = await callApi<Record<string, unknown>>('/api/episodes/language', {
        method: 'POST',
        body: { episodeId, locale },
      })
      if (!heard.ok) {
        setError(heard.error)
        return
      }
      const language = heard.data

      /*
       * The chunk uploads are re-signed by that call, and these are the ones
       * to use. A signed URL lasts fifteen minutes and a quarter-gigabyte
       * upload can run most of it, so the half-minute spent decoding and
       * listening must not come out of the upload's share of the window.
       */
      const chunks = (language['chunks'] as ChunkTarget[] | undefined) ?? planned

      await splitAndUpload(
        /*
         * Already decoded, above. The thunk stays because the headless
         * backfill tool hands in `ffmpeg` instead — the seam is what lets
         * both callers run the same settling and reporting code, rather
         * than keeping a second copy of the one thing in this repo that
         * fails silently.
         */
        () => Promise.resolve(samples),
        chunks,
        ({ done, total }) => {
          setProgress({ headline: `${labels.sendingPart} ${done + 1} / ${total}`, done, total })
        },
        /*
         * Where the seams actually landed, once moved off the clock and
         * into the gaps between words (US-040).
         *
         * Deliberately not caught. The audio is about to be cut on these,
         * so an episode whose boundaries were never recorded would be
         * offset by the planned ones instead — every timestamp after a seam
         * wrong, and every number still looking reasonable. Failing the
         * upload is the cheap outcome.
         */
        async (startsMs) => {
          const recorded = await callApi('/api/episodes/boundaries', {
            method: 'POST',
            body: { episodeId, startsMs },
          })
          if (!recorded.ok) throw new Error(labels.couldNotRead)
        },
      )

      setProgress({ headline: labels.transcribing, done: 0, total: chunks.length })
      await drive(episodeId, chunks.length)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.couldNotRead)
    } finally {
      setBusy(false)
      setProgress(undefined)
    }
  }

  /**
   * The pacing loop lives in `driveEpisode`. All this does is turn the
   * phase it reports into a sentence, which is the half that belongs in a
   * component: no layer below the presenter knows which language the reader
   * wants (ADR 0017), and the loop used to put the label in itself.
   */
  const drive = (episodeId: string, chunkCount: number): Promise<void> =>
    driveEpisode(
      { episodeId, chunkCount, locale },
      {
        onState: (state: DriveState) => {
          if (state.phase === 'finished') {
            setProgress(undefined)
            return
          }

          setProgress({
            // The count is the part that moves. The countdown restarts every
            // time a chunk lands, so on its own it looks like a loop.
            headline:
              state.phase === 'waiting' ? labels.waitingForAllowance : labels.transcribing,
            done: state.done,
            total: state.total,
            ...(state.phase === 'waiting' ? { nextAttemptAt: state.nextAttemptAt } : {}),
            ...(state.notice === undefined ? {} : { notice: state.notice }),
          })
        },
        onResult: setResult,
        onError: setError,
        onSettled: (id) => onEpisode(id, false),
      },
      { fetch: globalThis.fetch.bind(globalThis), sleep, now: Date.now },
    )

  /*
   * An episode left mid-transcription is picked up when the page opens.
   *
   * A full episode takes longer than a sitting, and the tab is the only
   * thing moving it forward. Without this the audio sat uploaded and half
   * transcribed with no way back to it but uploading the whole file again —
   * which is what happened, and cost a second episode's worth of a daily
   * budget that only holds three.
   */
  useEffect(() => {
    if (resumed.current) return
    resumed.current = true

    void (async () => {
      const answered = await callApi<{
        episode: {
          episodeId: string
          chunksDone: number
          chunkCount: number
          live: boolean
        } | null
      }>('/api/episodes/pending')
      if (!answered.ok) return

      const { episode } = answered.data
      if (episode === null) return

      // Shown either way. A finished episode is here to be read, and
      // without this the transcript vanished the moment transcription
      // ended and the page was reloaded.
      onEpisode(episode.episodeId, episode.live)

      /*
       * Only an unfinished episode is carried forward.
       *
       * Driving a finished one would re-stitch and re-analyse it on every
       * single page load — the same work that makes recounting free, run
       * for no reason, every time anybody opens the page.
       */
      if (!episode.live) return

      setBusy(true)
      setProgress({
        headline: labels.resuming,
        done: episode.chunksDone,
        total: episode.chunkCount,
      })
      try {
        await drive(episode.episodeId, episode.chunkCount)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : labels.couldNotRead)
      } finally {
        setBusy(false)
        setProgress(undefined)
      }
    })()
    // Once, on open. Re-running would start a second loop against the same
    // episode and send every chunk twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Panel heading={labels.uploadHeading}>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const file = input.current?.files?.[0]
            if (file) void send(file)
          }}
        >
          <p id={hintId} className="mt-1 text-sm" style={{ color: 'var(--quiet)' }}>
            {labels.uploadHint}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/*
              * The app's main action had no accessible name at all: a screen
              * reader announced it as an unlabelled file button, so the one
              * thing you come here to do was the one control that did not
              * say what it was for.
              *
              * Hidden rather than drawn, because the heading and the hint
              * already say it on screen; `aria-describedby` carries the hint
              * so the format advice is read out too, after the name.
              */}
            <label htmlFor={fileId} className="sr-only">
              {labels.uploadFileLabel}
            </label>
            <input
              id={fileId}
              ref={input}
              type="file"
              name="audio"
              accept={FILE_INPUT_ACCEPT}
              aria-describedby={hintId}
              required
              disabled={busy}
              onChange={(event) => setFilename(event.target.files?.[0]?.name ?? '')}
              className="text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
              style={{ color: 'var(--quiet)' }}
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-60"
              style={{ background: 'var(--accent)', color: 'var(--ground)' }}
            >
              {busy ? labels.uploading : labels.uploadButton}
            </button>
          </div>

          <p className="mt-2 text-xs" style={{ color: 'var(--quiet)' }}>
            {filename === '' ? labels.noFile : filename}
          </p>
        </form>

        {/* What the button is for, while there is nothing to show yet. */}
        {result === undefined ? (
          <p className="mt-4 text-sm" style={{ color: 'var(--quiet)' }}>
            {labels.nothingYet}
          </p>
        ) : null}
      </Panel>

      {progress ? <ProgressPanel progress={progress} labels={labels} /> : null}

      {alreadyHere !== undefined ? (
        <p
          role="status"
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--accent-quiet)', color: 'var(--prose)' }}
        >
          {labels.episodeAlreadyHere}
          {alreadyHere === '' ? null : (
            <span className="mt-1 block font-medium">{alreadyHere}</span>
          )}
        </p>
      ) : null}

      {error !== '' ? (
        <p
          role="alert"
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--alarm)', color: 'var(--alarm)' }}
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <section aria-live="polite">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>
              {labels.resultsHeading}
            </h2>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                background: result.status.done ? 'var(--accent)' : 'var(--edge)',
                color: result.status.done ? 'var(--ground)' : 'var(--prose)',
              }}
            >
              {result.status.statusLabel}
            </span>
          </div>

          {result.status.notice !== undefined ? (
            <p className="mt-2 text-sm" style={{ color: 'var(--quiet)' }}>
              {result.status.notice}
            </p>
          ) : null}

          {result.analysis ? (
            <>
              <StatStrip analysis={result.analysis} labels={labels} />
              <JokeList analysis={result.analysis} labels={labels} />
              <CountsTable analysis={result.analysis} labels={labels} />
            </>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
