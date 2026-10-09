import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Link } from '../../../i18n/navigation.js'
import { routing } from '../../../i18n/routing.js'
import { UI } from '../../../i18n/ui.js'

/**
 * The lemma dictionary's licence notice.
 *
 * A page rather than a line in the repo, because ODbL asks for the notice to
 * be reachable by anyone *using* the app — and most people using this will
 * never see the repository (ADR 0019).
 */
export default async function CreditsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  const labels = UI[locale]
  const pt = locale === 'pt'

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
      <Link href="/" className="text-sm underline" style={{ color: 'var(--link)' }}>
        ← {labels.appName}
      </Link>

      <h1 className="mt-6 text-3xl" style={{ fontFamily: 'var(--font-display)' }}>
        {labels.creditsHeading}
      </h1>

      <section className="mt-6 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg" style={{ fontFamily: 'var(--font-display)' }}>
          {labels.dictionaryHeading}
        </h2>
        <p>
          {pt ? 'Dados de lematização do português de ' : 'Portuguese lemmatisation data from '}
          <a
            href="https://github.com/michmech/lemmatization-lists"
            className="underline"
            style={{ color: 'var(--link)' }}
            rel="noreferrer"
          >
            Lemmatization Lists
          </a>
          {pt ? ', de Michal Měchura, sob a ' : ' by Michal Měchura, under the '}
          <a
            href="https://opendatacommons.org/licenses/odbl/"
            className="underline"
            style={{ color: 'var(--link)' }}
            rel="noreferrer"
          >
            Open Database License (ODbL)
          </a>
          {pt
            ? '. A lista portuguesa vem de dicionários Hunspell publicados pelo OpenOffice.org.'
            : '. The Portuguese list derives from Hunspell dictionaries published via OpenOffice.org.'}
        </p>
        <p style={{ color: 'var(--quiet)' }}>{labels.dictionaryWhy}</p>
        <p style={{ color: 'var(--quiet)' }}>{labels.dictionaryTerms}</p>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg" style={{ fontFamily: 'var(--font-display)' }}>
          {labels.transcriptionHeading}
        </h2>
        <p style={{ color: 'var(--quiet)' }}>{labels.transcriptionCredit}</p>
      </section>
    </main>
  )
}
