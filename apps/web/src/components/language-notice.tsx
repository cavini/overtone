'use client'

import { useEffect, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'
import { LANGUAGE_CHANGED } from './locale-switcher.js'

type Labels = Record<UiKey, string>

/**
 * Says what switching the language just did.
 *
 * A language picker normally changes only what you read. This one also
 * chooses what the next episode is transcribed and analysed as (ADR 0022),
 * which is a consequence nobody expects from a dropdown — so it is stated
 * plainly, once, on arrival.
 *
 * Shown after the fact rather than as a confirmation step: switching is
 * reversible and harmless until the next upload, and a dialog in front of a
 * language picker is a tax on everyone who just wanted to read.
 */
export function LanguageNotice({ labels }: { readonly labels: Labels }) {
  const [showing, setShowing] = useState(false)

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(LANGUAGE_CHANGED) === null) return

      // Read once. Reloading the page should not keep re-announcing it.
      window.sessionStorage.removeItem(LANGUAGE_CHANGED)
      setShowing(true)
    } catch {
      // No storage, no notice.
    }
  }, [])

  if (!showing) return null

  return (
    <aside
      role="status"
      className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
      style={{ borderColor: 'var(--accent-quiet)', background: 'var(--panel)' }}
    >
      <span aria-hidden style={{ color: 'var(--accent)' }}>
        ◆
      </span>
      <p className="flex-1" style={{ color: 'var(--prose)' }}>
        {labels.languageAffectsAudio}
      </p>
      <button
        type="button"
        onClick={() => setShowing(false)}
        className="text-xs underline"
        style={{ color: 'var(--quiet)' }}
      >
        {labels.gotIt}
      </button>
    </aside>
  )
}
