import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '../../../i18n/routing.js'
import { UI } from '../../../i18n/ui.js'

export default async function EnterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ wrong?: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  const labels = UI[locale]
  const wrong = (await searchParams).wrong !== undefined

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display)' }}>
        {labels.appName}
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--quiet)' }}>
        {labels.tagline}
      </p>

      <form
        method="post"
        action="/api/enter"
        className="mt-8 rounded-xl border p-5"
        style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
      >
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="password" className="block text-sm font-medium">
          {labels.passwordLabel}
        </label>
        <p className="mt-1 text-xs" style={{ color: 'var(--quiet)' }}>
          {labels.passwordHint}
        </p>

        <div className="mt-3 flex gap-2">
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
            style={{
              background: 'var(--ground)',
              borderColor: 'var(--edge)',
              color: 'var(--prose)',
            }}
          />
          <button
            type="submit"
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--accent)', color: 'var(--ground)' }}
          >
            {labels.enterButton}
          </button>
        </div>

        {wrong ? (
          <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--alarm)' }}>
            {labels.wrongPassword}
          </p>
        ) : null}
      </form>
    </main>
  )
}
