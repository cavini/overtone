'use client'

import type { Locale } from '@overtone/messages'
import { useRef, useState } from 'react'
import { audioTypeOf, FILE_INPUT_ACCEPT } from '../audio/audio-type.js'
import { measureDuration } from '../audio/measure-duration.js'
import { splitAndUpload, type ChunkTarget } from '../audio/split-and-upload.js'
import type { UiKey } from '../i18n/ui.js'
import type { AnalysisView, OutcomeView } from '../presenter/episode-view.js'
import { CountsTable, JokeList, StatStrip } from './counts-table.js'
import { ProgressPanel, type Progress } from './progress-panel.js'

type Labels = Record<UiKey, string>

interface Result {
  readonly status: OutcomeView
  readonly analysis?: AnalysisView
}

/** Never sleep longer than this in one go, so the page keeps saying something. */
const MAX_SLEEP_MS = 30_000

const sleep = (ms: number): Promise<void> =>
  new Promise((resume) => {
    setTimeout(resume, Math.min(ms, MAX_SLEEP_MS))
  })

/**
 * Reads a response that is supposed to be JSON.
 *
 * A platform error — a body too large, a function that timed out — comes
 * back as HTML or plain text, and `response.json()` throws on it. Left
 * unhandled that surfaced as "the file may be corrupt", which sent everyone
 * looking at the audio instead of at the request.
 */
async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`${response.status} ${text.slice(0, 120)}`)
  }
}

export function UploadForm({
  locale,
  labels,
}: {
  readonly locale: Locale
  readonly labels: Labels
}) {
  const input = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | undefined>(undefined)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | undefined>(undefined)

  async function send(file: File): Promise<void> {
    setBusy(true)
    setError('')
    setResult(undefined)
    setProgress({ headline: labels.preparing, done: 0, total: 0 })

    try {
      const contentType = audioTypeOf(file.name, file.type)
      if (contentType === undefined) {
        setError(labels.unsupportedFile)
        return
      }

      const durationMs = await measureDuration(file, contentType)

      // Only numbers cross the wire here. The audio goes straight to storage
      // from the browser, because the server cannot accept a file this size.
      const startResponse = await fetch('/api/episodes/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          durationMs,
          locale,
          title: file.name.replace(/\.[^.]+$/u, ''),
        }),
      })

      const started = await readJson(startResponse)
      if (!startResponse.ok || started['error'] !== undefined) {
        setError(String(started['error'] ?? 'UNEXPECTED'))
        return
      }

      const chunks = started['chunks'] as ChunkTarget[]
      const episodeId = String(started['episodeId'])

      await splitAndUpload(file, chunks, ({ done, total }) => {
        setProgress({ headline: `${labels.sendingPart} ${done + 1} / ${total}`, done, total })
      })

      setProgress({ headline: labels.transcribing, done: 0, total: chunks.length })

      // One chunk a step, coming back rather than waiting. An episode is
      // longer than a full hourly balance, so some of it always waits for
      // the allowance to refill.
      for (;;) {
        const response = await fetch('/api/episodes/advance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ episodeId, locale }),
        })

        const payload = await readJson(response)
        if (!response.ok || payload['error'] !== undefined) {
          setError(String(payload['error'] ?? 'UNEXPECTED'))
          return
        }

        const status = payload['status'] as OutcomeView
        const analysis = payload['analysis'] as AnalysisView | undefined
        setResult(analysis === undefined ? { status } : { status, analysis })

        if (status.done) {
          setProgress(undefined)
          return
        }

        const waitMs = Number(payload['retryAfterMs'] ?? 0)
        const done = Number(payload['chunksDone'] ?? 0)
        const total = Number(payload['chunkCount'] ?? chunks.length)

        // The count is the part that moves. The countdown restarts every
        // time a chunk lands, so on its own it looks like a loop.
        setProgress({
          headline: waitMs > 0 ? labels.waitingForAllowance : labels.transcribing,
          done,
          total,
          ...(waitMs > 0 ? { nextAttemptAt: Date.now() + waitMs } : {}),
          ...(status.notice === undefined ? {} : { notice: status.notice }),
        })

        await sleep(waitMs)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.couldNotRead)
    } finally {
      setBusy(false)
      setProgress(undefined)
    }
  }

  return (
    <>
      <form
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
        onSubmit={(event) => {
          event.preventDefault()
          const file = input.current?.files?.[0]
          if (file) void send(file)
        }}
      >
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>
          {labels.uploadHeading}
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--quiet)' }}>
          {labels.uploadHint}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            name="audio"
            accept={FILE_INPUT_ACCEPT}
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

      {progress ? <ProgressPanel progress={progress} labels={labels} /> : null}

      {error !== '' ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--alarm)', color: 'var(--alarm)' }}
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="mt-8" aria-live="polite">
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
      ) : (
        <p className="mt-8 text-sm" style={{ color: 'var(--quiet)' }}>
          {labels.nothingYet}
        </p>
      )}
    </>
  )
}
