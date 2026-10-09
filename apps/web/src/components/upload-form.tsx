'use client'

import type { Locale } from '@overtone/messages'
import { useRef, useState } from 'react'
import { audioTypeOf, FILE_INPUT_ACCEPT } from '../audio/audio-type.js'
import { measureDuration } from '../audio/measure-duration.js'
import type { UiKey } from '../i18n/ui.js'
import type { AnalysisView, OutcomeView } from '../presenter/episode-view.js'
import { CountsTable, JokeList, StatStrip } from './counts-table.js'

type Labels = Record<UiKey, string>

interface Result {
  readonly status: OutcomeView
  readonly analysis?: AnalysisView
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
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | undefined>(undefined)

  async function send(file: File): Promise<void> {
    setBusy(true)
    setError('')
    setResult(undefined)

    try {
      // Decided here, from the extension, and sent alongside — so the server
      // stores the same type the duration was measured with, whatever this
      // particular browser thinks the file is.
      const contentType = audioTypeOf(file.name, file.type)
      if (contentType === undefined) {
        setError(labels.unsupportedFile)
        return
      }

      const body = new FormData()
      body.set('audio', file)
      body.set('locale', locale)
      body.set('contentType', contentType)
      body.set('durationMs', String(await measureDuration(file, contentType)))

      const response = await fetch('/api/episodes', { method: 'POST', body })
      const payload = (await response.json()) as Result & { error?: string }

      if (!response.ok || payload.error !== undefined) {
        setError(payload.error ?? 'UNEXPECTED')
        return
      }
      setResult(payload)
    } catch {
      setError(labels.couldNotRead)
    } finally {
      setBusy(false)
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
