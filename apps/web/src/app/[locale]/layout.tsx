import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { routing } from '../../i18n/routing.js'
import { UI } from '../../i18n/ui.js'
import '../globals.css'

/*
 * A high-contrast display serif for the headings, a humanist sans for
 * reading, and a mono for the numbers — which are the whole point here, and
 * need to line up in columns.
 *
 * Instrument Serif rather than Fraunces, to match the plan-of-record
 * document where this project's look was settled. It ships one weight and an
 * italic, which is the whole of it: a display face used large, never for
 * running text, so there is nothing for a bold to do.
 */
const display = Instrument_Serif({
  subsets: ['latin', 'latin-ext'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

const body = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<{ title: string; description: string }> {
  const { locale } = await params
  const labels = hasLocale(routing.locales, locale) ? UI[locale] : UI[routing.defaultLocale]

  return { title: labels.appName, description: labels.tagline }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  // So the rest of the tree renders statically where it can.
  setRequestLocale(locale)

  return (
    <html lang={locale === 'pt' ? 'pt-BR' : 'en'} suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
