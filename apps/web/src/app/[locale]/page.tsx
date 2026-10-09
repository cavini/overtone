import { renderMessage } from '@overtone/messages'
import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { LocaleSwitcher } from '../../components/locale-switcher.js'
import { UploadForm } from '../../components/upload-form.js'
import { routing } from '../../i18n/routing.js'
import { UI } from '../../i18n/ui.js'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  const labels = UI[locale]

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-4xl sm:text-5xl"
            style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
          >
            {labels.appName}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--quiet)' }}>
            {labels.tagline}
          </p>
        </div>
        <LocaleSwitcher label={labels.language} />
      </header>

      <UploadForm locale={locale} labels={labels} />

      {/* Said once, plainly: these counts describe the edit, not the room. */}
      <footer className="mt-14 border-t pt-5 text-xs" style={{ borderColor: 'var(--edge)', color: 'var(--quiet)' }}>
        <p>{renderMessage(locale, 'COUNTS_DESCRIBE_PUBLISHED_EDIT', {})}</p>
        <p className="mt-1">{renderMessage(locale, 'ANALYSIS_ALWAYS_PTBR', {})}</p>
      </footer>
    </main>
  )
}
