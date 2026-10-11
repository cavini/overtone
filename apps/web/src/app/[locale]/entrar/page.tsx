import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { GateForm } from '../../../components/gate-form.js'
import { SignInForm } from '../../../components/sign-in-form.js'
import { whichDoor } from '../../../presenter/which-door.js'
import { routing } from '../../../i18n/routing.js'
import { UI } from '../../../i18n/ui.js'

/**
 * The way in — whichever one is actually open.
 *
 * Magic links need an email provider before they reach anybody but the
 * project owner, so while `OVERTONE_PASSWORD` is set the password is the
 * only working door and this page asks for it (ADR 0028).
 *
 * It asked for an email address regardless, which is how PR #28 shipped a
 * form that posted to a provider configured to deliver to one person. The
 * mismatch hid behind the builder's own month-long cookie: they were never
 * shown this page, so they never saw that nobody else could get past it.
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
      <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display)' }}>
        {labels.appName}
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--quiet)' }}>
        {labels.tagline}
      </p>

      {whichDoor(process.env['OVERTONE_PASSWORD']) === 'password' ? (
        <GateForm locale={locale} labels={labels} wrong={wrong === '1'} />
      ) : (
        <SignInForm
          locale={locale}
          labels={labels}
          {...(trouble === undefined ? {} : { trouble })}
        />
      )}
    </main>
  )
}
