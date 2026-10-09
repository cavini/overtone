'use client'

import type { Locale } from '@overtone/messages'
import { useRef, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'
import type { AnalysisView, OutcomeView } from '../presenter/episode-view.js'
import { CountsTable, JokeList, StatStrip } from './counts-table.js'

type Labels = Record<UiKey, string>

interface Result {
  readonly status: OutcomeView
  readonly analysis?: AnalysisView
}

/**
 * Reads how long the audio is, in the browser.
 *
 * The chunk plan needs the duration *before* anything is sent, and the server
 * would have to decode the file to learn it. The browser already has a
 * decoder, so it answers — which is also where the splitting will happen when
 * full-length episodes arrive (ADR 0020).
 */
function measureDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const probe = new Audio()

    const finish = (outcome: () => void) => {
      URL.revokeObjectURL(url)
      outcome()
    }

    probe.addEventListener('loadedmetadata', () => {
      const seconds = probe.duration
      finish(() =>
        Number.isFinite(seconds) && seconds > 0
          ? resolve(Math.round(seconds * 1000))
          : reject(new Error('duration unknown')),
      )
    })
    probe.addEventListener('error', () => {
      finish(() => reject(new Error('audio unreadable')))
    })

    probe.preload = 'metadata'
    probe.src = url
  })
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
      const body = new FormData()
      body.set('audio', file)
      body.set('locale', locale)
      body.set('durationMs', String(await measureDuration(file)))

      const response = await fetch('/api/episodes', { method: 'POST', body })
      const payload = (await response.json()) as Result & { error?: string }

      if (!response.ok || payload.error !== undefined) {
        setError(payload.error ?? 'UNEXPECTED')
        return
      }
      setResult(payload)
    } catch {
      setError('UNEXPECTED')
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
            accept="audio/*"
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
