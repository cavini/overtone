import type { UiKey } from '../i18n/ui.js'

type Labels = Record<UiKey, string>

/**
 * The shared password, asked for on the screen.
 *
 * A plain form with no `use client` and no `fetch`: it posts to
 * `/api/enter`, which sets the cookie and redirects. That makes it the one
 * screen in the app that works with JavaScript switched off or still
 * loading — appropriate for the door, which is the one thing that must
 * never be unavailable.
 */
export function GateForm({
  locale,
  labels,
  wrong,
}: {
  readonly locale: string
  readonly labels: Labels
  /** Whether they have just been sent back here by a password that did not match. */
  readonly wrong: boolean
}) {
  return (
    <form action="/api/enter" method="post" className="mt-8 flex flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />

      <label htmlFor="password" className="text-sm" style={{ color: 'var(--quiet)' }}>
        {labels.passwordLabel}
      </label>

      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        autoFocus
        aria-describedby={wrong ? 'wrong-password' : undefined}
        className="rounded-md border px-3 py-3 text-base"
        style={{
          borderColor: wrong ? 'var(--warn, #b4453a)' : 'var(--edge)',
          background: 'var(--ground)',
          color: 'var(--prose)',
        }}
      />

      {/*
       * `aria-live`, because a screen reader lands on a page that looks
       * identical to the one just left — the only difference is this line.
       */}
      {wrong ? (
        <p id="wrong-password" aria-live="polite" className="text-sm" style={{ color: '#b4453a' }}>
          {labels.wrongPassword}
        </p>
      ) : null}

      <button
        type="submit"
        className="rounded-md px-4 py-3 text-base font-medium"
        style={{ background: 'var(--prose)', color: 'var(--ground)' }}
      >
        {labels.enter}
      </button>

      <p className="text-sm" style={{ color: 'var(--quiet)' }}>
        {labels.passwordHint}
      </p>
    </form>
  )
}
