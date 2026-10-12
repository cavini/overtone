import { headers } from 'next/headers'
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import type { ReactNode } from 'react'
import { preferredLocale } from '../../presenter/preferred-locale.js'
import '../globals.css'

/*
 * The shared page lives outside the locale tree, so it needs its own root.
 *
 * Without one Next writes a placeholder — `<title>Next.js</title>`, no
 * stylesheet, no fonts — and serves it. The page rendered as unstyled
 * markup with the density strip coming out as a numbered list from 1 to 40.
 * It is the one page a stranger ever sees, and it was the only page with no
 * design on it at all.
 *
 * The same three faces as the rest of the app: a serif with optical sizing
 * for headings, a humanist sans for reading, and a mono for the numbers —
 * which are the whole point here and need to line up in columns.
 */
const display = Fraunces({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-fraunces',
  axes: ['SOFT', 'WONK', 'opsz'],
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

export const metadata = {
  title: 'Overtone',
  robots: { index: false, follow: false },
}

/*
 * `lang` has to match what is actually on the page.
 *
 * It said pt-BR unconditionally, which is what a screen reader uses to pick
 * how to pronounce the words — so an English page was being read out with
 * Portuguese phonetics. The quotes stay Brazilian whatever the labels do,
 * but the page as a whole is in the reader's language now.
 */
export default async function SharedLayout({ children }: { readonly children: ReactNode }) {
  const locale = preferredLocale((await headers()).get('accept-language'))

  return (
    <html lang={locale === 'pt' ? 'pt-BR' : 'en'} suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</body>
    </html>
  )
}
