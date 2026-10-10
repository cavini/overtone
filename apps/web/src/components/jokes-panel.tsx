'use client'

import type { Locale } from '@overtone/messages'
import { useEffect, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'

type Labels = Record<UiKey, string>

interface Joke {
  readonly id: string
  readonly name: string
  readonly patterns: readonly string[]
}

/**
 * The running jokes, and the spellings each one answers to.
 *
 * Spellings are the whole feature, not a detail. The transcriber decides how
 * a word comes out and it does not always agree with how it was said:
 * experiment 0001 found `hotdog` consistently heard as "Outdog", and the
 * same joke counted zero without that alias and twice with it (ADR 0006).
 * So the form asks for spellings in the plural and says why.
 */
export function JokesPanel({ locale, labels }: { readonly locale: Locale; readonly labels: Labels }) {
  const [jokes, setJokes] = useState<readonly Joke[]>([])
  const [name, setName] = useState('')
  const [spellings, setSpellings] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recounting, setRecounting] = useState(false)
  const [recounted, setRecounted] = useState(false)

  const load = async (): Promise<void> => {
    const response = await fetch('/api/topics').catch(() => undefined)
    if (!response?.ok) return

    const { topics } = (await response.json()) as { topics: Joke[] }
    setJokes(topics)
  }

  useEffect(() => {
    void load()
  }, [])

  async function add(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          // Commas, because that is how a person lists things.
          patterns: spellings.split(',').map((part) => part.trim()).filter(Boolean),
          locale,
        }),
      })
      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setError(payload.error ?? '')
        return
      }
      setName('')
      setSpellings('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string): Promise<void> {
    await fetch(`/api/topics?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    await load()
  }

  return (
    <section
      className="mt-6 rounded-xl border p-5"
      style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
    >
      <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>
        {labels.jokesHeading}
      </h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--quiet)' }}>
        {labels.jokesHint}
      </p>

      {jokes.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: 'var(--quiet)' }}>
          {labels.noJokes}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {jokes.map((joke) => (
            <li
              key={joke.id}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border px-3 py-2"
              style={{ borderColor: 'var(--edge)' }}
            >
              <div className="min-w-0">
                <span className="font-medium">{joke.name}</span>
                <span className="ml-2 text-xs" style={{ color: 'var(--quiet)' }}>
                  {joke.patterns.join(' · ')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void remove(joke.id)}
                className="text-xs underline"
                style={{ color: 'var(--quiet)' }}
              >
                {labels.removeJoke}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
      >
        <label className="text-xs" style={{ color: 'var(--quiet)' }}>
          {labels.jokeName}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={labels.jokeNamePlaceholder}
            required
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            style={{ background: 'var(--ground)', borderColor: 'var(--edge)', color: 'var(--prose)' }}
          />
        </label>
        <label className="text-xs" style={{ color: 'var(--quiet)' }}>
          {labels.jokeSpellings}
          <input
            value={spellings}
            onChange={(event) => setSpellings(event.target.value)}
            placeholder={labels.jokeSpellingsPlaceholder}
            required
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            style={{ background: 'var(--ground)', borderColor: 'var(--edge)', color: 'var(--prose)' }}
          />
          <span className="mt-1 block">{labels.jokeSpellingsHint}</span>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 sm:mt-5"
          style={{ background: 'var(--accent)', color: 'var(--ground)' }}
        >
          {labels.addJoke}
        </button>
      </form>

      {jokes.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4" style={{ borderColor: 'var(--edge)' }}>
          <button
            type="button"
            disabled={recounting}
            onClick={() => {
              setRecounting(true)
              setRecounted(false)
              void fetch('/api/topics/recount', { method: 'POST' })
                .then(() => setRecounted(true))
                .finally(() => setRecounting(false))
            }}
            className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
            style={{ borderColor: 'var(--edge)', color: 'var(--prose)' }}
          >
            {recounting ? labels.recounting : labels.recount}
          </button>
          {recounted ? (
            <span className="text-xs" style={{ color: 'var(--accent)' }}>
              {labels.recounted}
            </span>
          ) : null}
        </div>
      ) : null}

      {error !== '' ? (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--alarm)' }}>
          {error}
        </p>
      ) : null}
    </section>
  )
}
