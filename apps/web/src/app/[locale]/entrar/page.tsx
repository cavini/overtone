import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { SignInForm } from '../../../components/sign-in-form.js'
import { routing } from '../../../i18n/routing.js'
import { UI } from '../../../i18n/ui.js'

/**
 * Where somebody asks for a sign-in link.
 *
 * No password. The group is four people who already know each other, and a
 * shared password is a thing to be lost, forwarded and never changed — it
 * also cannot tell them apart, which is the whole point of having accounts
 * at all.
 */
export default async function EnterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ trouble?: string }>
}) {
  const { locale } = await params
  // Why they were sent back here, when they were sent back here.
  const { trouble } = await searchParams
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

      <SignInForm
        locale={locale}
        labels={labels}
        {...(trouble === undefined ? {} : { trouble })}
      />
    </main>
  )
}
