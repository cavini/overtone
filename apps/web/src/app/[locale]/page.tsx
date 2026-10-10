import { renderMessage } from '@overtone/messages'
import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { JokesPanel } from '../../components/jokes-panel.js'
import { LanguageNotice } from '../../components/language-notice.js'
import { LocaleSwitcher } from '../../components/locale-switcher.js'
import { Link } from '../../i18n/navigation.js'
import { Workspace } from '../../components/workspace.js'
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

      <LanguageNotice labels={labels} />

      <JokesPanel locale={locale} labels={labels} />

      <Workspace locale={locale} labels={labels} />

      {/* Said once, plainly: these counts describe the edit, not the room. */}
      <footer className="mt-14 border-t pt-5 text-xs" style={{ borderColor: 'var(--edge)', color: 'var(--quiet)' }}>
        <p>{renderMessage(locale, 'COUNTS_DESCRIBE_PUBLISHED_EDIT', {})}</p>
        <p className="mt-1">{renderMessage(locale, 'ANALYSIS_ALWAYS_PTBR', {})}</p>
        {/* ODbL asks for the dictionary's notice to be reachable by anyone
            using the app, not just anyone reading the repository. */}
        <p className="mt-3">
          <Link href="/creditos" className="underline" style={{ color: 'var(--link)' }}>
            {labels.credits}
          </Link>
        </p>
      </footer>
    </main>
  )
}
