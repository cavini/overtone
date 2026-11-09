'use client'

import { LOCALES, type Locale } from '@overtone/messages'
import { useParams } from 'next/navigation'
import { useTransition } from 'react'
import { usePathname, useRouter } from '../i18n/navigation.js'

const NAMES: Record<Locale, string> = { pt: 'Português', en: 'English' }

/**
 * Switches the language of the interface, and of nothing else.
 *
 * It briefly did more. ADR 0022 made the language a property of the episode
 * and used this control to choose it, so switching here also chose what the
 * next upload would be transcribed and analysed as — a consequence large
 * enough that the following page had to announce it. The episode's language
 * is now heard from the episode's own audio, which is what the reader
 * expected a reading preference to mean all along.
 *
 * No count can move because somebody switched, and none ever could: each
 * episode records what it was transcribed as.
 */
export function LocaleSwitcher({ label }: { readonly label: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const [pending, startTransition] = useTransition()
  const current = String(params['locale'] ?? '') as Locale

  return (
    <label className="flex items-center gap-2 text-sm text-quiet">
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
        className="rounded-md border px-2 py-1 text-sm disabled:opacity-60 bg-panel border-edge text-prose"
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
