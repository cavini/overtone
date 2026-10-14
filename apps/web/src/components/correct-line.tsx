'use client'

import { useState } from 'react'
import type { UiKey } from '../i18n/ui.js'

type Labels = Record<UiKey, string>

/**
 * One line of the transcript, open for typing.
 *
 * A textarea rather than an input: a line of this show runs to forty words
 * and wraps, and a single-line box would scroll sideways through the thing
 * being corrected.
 *
 * Enter saves and shift-Enter breaks the line, which is the convention for a
 * box that holds one thought. Escape leaves without saving — the same key
 * that closes the delete dialog, for the same reason.
 */
export function CorrectLine({
  labels,
  text,
  busy,
  onSave,
  onCancel,
}: {
  readonly labels: Labels
  readonly text: string
  readonly busy: boolean
  readonly onSave: (text: string) => void
  readonly onCancel: () => void
}) {
  const [draft, setDraft] = useState(text)

  return (
    <span className="min-w-0 flex-1">
      <textarea
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={draft}
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSave(draft)
          }
        }}
        rows={2}
        aria-label={labels.correctLine}
        className="w-full resize-y rounded-md border px-2 py-1 text-sm leading-relaxed"
        style={{ background: 'var(--ground)', borderColor: 'var(--accent)', color: 'var(--prose)' }}
      />
      <span className="mt-1 flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(draft)}
          className="rounded-md px-2 py-1 font-medium disabled:opacity-60"
          style={{ background: 'var(--accent)', color: 'var(--ground)' }}
        >
          {busy ? labels.correctSaving : labels.correctSave}
        </button>
        <button type="button" onClick={onCancel} style={{ color: 'var(--quiet)' }}>
          {labels.libraryDeleteCancel}
        </button>
        {/*
          * Said once, here, where somebody is about to find out: the counts
          * are re-derived from the corrected words, so fixing a line moves
          * every number that word was in.
          */}
        <span style={{ color: 'var(--quiet)' }}>{labels.correctRecounts}</span>
      </span>
    </span>
  )
}
