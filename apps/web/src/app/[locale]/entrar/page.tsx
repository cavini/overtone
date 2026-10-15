import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { OvertoneMark } from '../../../components/overtone-mark.js'
import { SignInForm } from '../../../components/sign-in-form.js'
import { routing } from '../../../i18n/routing.js'
import { UI } from '../../../i18n/ui.js'

/**
 * The way in: an email and a password.
 *
 * Which form to show here went wrong twice, in opposite directions. PR #28
 * showed the magic-link form while the only working way in was the shared
 * password. Then an email-and-password form shipped that this page never
 * rendered, because it drew whichever single door the environment implied and
 * the shared password won whenever it was set. Both times the mismatch hid
 * behind the builder's own month-long cookie — they were never shown this
 * page, so they never saw that nobody else could get in.
 *
 * There is one door now, and nothing decides whether to draw it.
 */
export default async function EnterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ trouble?: string; wrong?: string }>
}) {
  const { locale } = await params
  // Why they were sent back here, when they were sent back here.
  const { trouble, wrong } = await searchParams
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  const labels = UI[locale]

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <OvertoneMark className="block h-8 w-auto" />
      <h1 className="mt-3 text-5xl leading-none" style={{ fontFamily: 'var(--font-display)' }}>
        {labels.appName}
      </h1>
      <p
        className="mt-2 text-base italic"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--prose-2)' }}
      >
        {labels.tagline}
      </p>

      <SignInForm
        locale={locale}
        labels={labels}
        {...(trouble === undefined ? {} : { trouble })}
      />
    </main>
  )
}
