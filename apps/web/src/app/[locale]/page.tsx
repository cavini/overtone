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
import { OvertoneMark } from '../../components/overtone-mark.js'
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
          {/*
            * The mark above the word, not beside it. The arcs are wide and
            * low — set alongside a word they fight it for the same
            * horizontal run, and stacked they read as what they are: the
            * harmonics sitting above the note.
            */}
          <OvertoneMark className="block h-8 w-auto" />
          <h1
            className="mt-3 text-5xl leading-none sm:text-6xl"
            style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
          >
            {labels.appName}
          </h1>
          <p
            className="mt-2 text-base italic"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--prose-2)' }}
          >
            {labels.tagline}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <LocaleSwitcher label={labels.language} />
          {/*
           * A form, not a link. A sign-out somebody else's page can trigger
           * with an image tag is a nuisance anybody can inflict.
           */}
          <form method="post" action="/api/auth/sign-out">
            <button type="submit" className="text-sm underline" style={{ color: 'var(--quiet)' }}>
              {labels.signOut}
            </button>
          </form>
        </div>
      </header>

      {/*
       * One column, one rhythm.
       *
       * Every block used to carry its own top margin, which held up until
       * one of them did not: the upload form had none, so it sat flush
       * against the running jokes above it. A block cannot see its
       * neighbours, so the gap between them was never its decision to make.
       */}
      <div className="stack flex flex-col gap-6">
        <LanguageNotice labels={labels} />

        {/* Upload, search, the library, and the transcript they open. */}
        <Workspace locale={locale} labels={labels} />

        {/*
         * Last, because it is a setting rather than a thing to read. It
         * decides what the next upload counts, not what this page says, and
         * it used to be the first thing between the reader and the words.
         */}
        <JokesPanel locale={locale} labels={labels} />
      </div>

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
