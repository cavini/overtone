'use client'

import { LOCALES, type Locale } from '@overtone/messages'
import { useParams } from 'next/navigation'
import { useTransition } from 'react'
import { usePathname, useRouter } from '../i18n/navigation.js'

const NAMES: Record<Locale, string> = { pt: 'Português', en: 'English' }

/** Set just before navigating, read once on the page they arrive at. */
export const LANGUAGE_CHANGED = 'overtone.language-changed'

/**
 * Switches the language — of the interface *and* of what gets transcribed
 * next.
 *
 * It used to be the interface only, with the audio pinned to Brazilian
 * Portuguese (ADR 0014). It now also chooses what future episodes are
 * transcribed and analysed as (ADR 0022), which is a bigger consequence
 * than a language picker usually carries — so the next page says so.
 *
 * Episodes already transcribed are untouched: each one records what it was
 * transcribed as, so no existing count can move because somebody switched.
 */
export function LocaleSwitcher({ label }: { readonly label: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const [pending, startTransition] = useTransition()
  const current = String(params['locale'] ?? '') as Locale

  return (
    <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--quiet)' }}>
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select
        value={current}
        disabled={pending}
        aria-label={label}
        onChange={(event) => {
          const next = event.target.value as Locale

          // Flagged before navigating, because the notice belongs on the
          // page they land on — this component is about to be replaced.
          try {
            window.sessionStorage.setItem(LANGUAGE_CHANGED, next)
          } catch {
            // A browser refusing storage is not a reason to block the
            // switch; they just miss the notice.
          }

          startTransition(() => {
            router.replace(pathname, { locale: next })
          })
        }}
        className="rounded-md border px-2 py-1 text-sm disabled:opacity-60"
        style={{
          background: 'var(--panel)',
          borderColor: 'var(--edge)',
          color: 'var(--prose)',
        }}
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {NAMES[locale]}
          </option>
        ))}
      </select>
    </label>
  )
}
