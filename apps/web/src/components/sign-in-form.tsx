'use client'

import type { IdentityFailure } from '@overtone/core'
import { MIN_PASSWORD_CHARS } from '@overtone/core'
import { renderMessage, type Locale } from '@overtone/messages'
import { useId, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'

type Labels = Record<UiKey, string>

/**
 * Which label explains each refusal.
 *
 * Keyed on the port's own union rather than on `string`, so a code added
 * there fails the build here instead of quietly becoming "could not send
 * it just now".
 */
const TROUBLE: Record<IdentityFailure['code'], UiKey> = {
  LINK_EXPIRED: 'linkExpired',
  EMAIL_REJECTED: 'emailRejected',
  TOO_MANY_LINKS: 'tooManyLinks',
  WRONG_EMAIL_OR_PASSWORD: 'wrongEmailOrPassword',
  EMAIL_TAKEN: 'emailTaken',
  PASSWORD_REJECTED: 'passwordRejected',
  EMAIL_NOT_CONFIRMED: 'emailNotConfirmed',
  PROVIDER_UNAVAILABLE: 'signInUnavailable',
}

const explain = (code: string | undefined): UiKey | undefined =>
  code === undefined ? undefined : (TROUBLE[code as IdentityFailure['code']] ?? 'signInUnavailable')

/** Which of the three things this form is doing. */
type Doing = 'entering' | 'registering' | 'recovering'

/**
 * The way in.
 *
 * A password, because a link costs an email every time and the free tier
 * rations them — which is also why the session cookie lasts a month. The
 * link is kept for one job: getting back in without the password.
 *
 * Every refusal reads the same for a wrong password, an address with no
 * account, and one nobody invited. Three answers would make this form a way
 * of asking who is in the group, from a page anybody can load.
 */
export function SignInForm({
  locale,
  labels,
  trouble: arrivedWith,
}: {
  readonly locale: Locale
  readonly labels: Labels
  /** Why a clicked link sent them back here, if one did. */
  readonly trouble?: string
}) {
  const emailId = useId()
  const passwordId = useId()
  const [doing, setDoing] = useState<Doing>('entering')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [trouble, setTrouble] = useState<UiKey | undefined>(explain(arrivedWith))
  /** A refusal that carries its own numbers, already rendered. */
  const [said, setSaid] = useState<string | undefined>(undefined)

  const go = (next: Doing): void => {
    setDoing(next)
    setTrouble(undefined)
    setSaid(undefined)
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setTrouble(undefined)
    setSaid(undefined)

    try {
      if (doing === 'recovering') {
        const response = await fetch('/api/auth/link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, locale }),
        }).catch(() => undefined)

        const payload = ((await response?.json().catch(() => ({}))) ?? {}) as { error?: string }
        if (response?.ok === true) setSent(true)
        else setTrouble(explain(payload.error))
        return
      }

      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, making: doing === 'registering' }),
      }).catch(() => undefined)

      const payload = ((await response?.json().catch(() => ({}))) ?? {}) as { error?: string }

      if (response?.ok === true) {
        /*
         * A whole page load, not a client-side route change. Who is signed
         * in is read from a cookie on the server, so the page that renders
         * next has to be a new one — a soft navigation would re-render the
         * same signed-out tree.
         */
        window.location.assign(`/${locale}`)
        return
      }

      /*
       * The password rules answer with a number in them, so they are
       * message codes rather than chrome labels and are rendered here.
       */
      if (payload.error === 'PASSWORD_TOO_SHORT') {
        setSaid(renderMessage(locale, 'PASSWORD_TOO_SHORT', { min_chars: MIN_PASSWORD_CHARS }))
        return
      }
      if (payload.error === 'PASSWORD_NEEDS_CONTENT') {
        setSaid(renderMessage(locale, 'PASSWORD_NEEDS_CONTENT', {}))
        return
      }

      setTrouble(explain(payload.error))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <p
        className="mt-8 rounded-xl border p-5 text-sm"
        style={{ borderColor: 'var(--edge)', background: 'var(--panel)', color: 'var(--prose)' }}
      >
        {labels.linkSent}
      </p>
    )
  }

  const asking = doing === 'recovering'
  const making = doing === 'registering'

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-8 rounded-xl border p-5"
      style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
    >
      <label htmlFor={emailId} className="block text-sm font-medium">
        {labels.emailLabel}
      </label>
      {asking ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--quiet)' }}>
          {labels.emailHint}
        </p>
      ) : null}

      <input
        id={emailId}
        type="email"
        name="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={labels.emailPlaceholder}
        className="mt-3 w-full rounded-md border px-3 py-2"
        style={{ borderColor: 'var(--edge)', background: 'var(--ground)', color: 'var(--prose)' }}
      />

      {asking ? null : (
        <>
          <label htmlFor={passwordId} className="mt-4 block text-sm font-medium">
            {labels.passwordLabel}
          </label>
          <input
            id={passwordId}
            type="password"
            name="password"
            required
            /*
             * Which of the two it is, so a password manager offers to save a
             * new password when one is being set and fills the saved one
             * when it is not.
             */
            autoComplete={making ? 'new-password' : 'current-password'}
            minLength={making ? MIN_PASSWORD_CHARS : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={making ? labels.passwordPlaceholder : undefined}
            className="mt-3 w-full rounded-md border px-3 py-2"
            style={{
              borderColor: 'var(--edge)',
              background: 'var(--ground)',
              color: 'var(--prose)',
            }}
          />
        </>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded-md px-4 py-2 font-medium"
        style={{ background: 'var(--accent)', color: 'var(--ground)' }}
      >
        {asking
          ? busy
            ? labels.sendingLink
            : labels.sendLink
          : making
            ? busy
              ? labels.creatingAccount
              : labels.createAccount
            : busy
              ? labels.entering
              : labels.enter}
      </button>

      {/* Buttons, not links: nothing navigates, the same form changes job. */}
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={() => go(making ? 'entering' : 'registering')}
          style={{ color: 'var(--accent)' }}
        >
          {making ? labels.haveAnAccount : labels.needAnAccount}
        </button>
        <button
          type="button"
          onClick={() => go(asking ? 'entering' : 'recovering')}
          style={{ color: 'var(--quiet)' }}
        >
          {asking ? labels.backToPassword : labels.forgotPassword}
        </button>
      </div>

      {trouble === undefined && said === undefined ? null : (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--alarm)' }}>
          {said ?? (trouble === undefined ? '' : labels[trouble])}
        </p>
      )}
    </form>
  )
}
