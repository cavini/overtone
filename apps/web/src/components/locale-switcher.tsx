'use client'

import { LOCALES, type Locale } from '@overtone/messages'
import { useParams } from 'next/navigation'
import { useTransition } from 'react'
import { usePathname, useRouter } from '../i18n/navigation.js'

const NAMES: Record<Locale, string> = { pt: 'Português', en: 'English' }

/**
 * Switches the interface language, and only the interface language.
 *
 * The audio is always Brazilian Portuguese and the pipeline always runs in
 * it, so nothing here can change a count — which is the thing a reader would
 * reasonably fear and the thing a test proves (ADR 0014).
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
