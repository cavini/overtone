'use client'

import type { IdentityFailure } from '@overtone/core'
import type { Locale } from '@overtone/messages'
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

/**
 * Asks for a sign-in link.
 *
 * Says the same thing whether or not the address is already known. An
 * answer that differed would turn this form into a way of finding out who
 * is in the group, for anybody who can load the page.
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
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [trouble, setTrouble] = useState<UiKey | undefined>(explain(arrivedWith))

  async function ask(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setSending(true)
    setTrouble(undefined)

    try {
      const response = await fetch('/api/auth/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, locale }),
      }).catch(() => undefined)

      const payload = ((await response?.json().catch(() => ({}))) ?? {}) as { error?: string }

      if (response?.ok === true) {
        setSent(true)
        return
      }

      setTrouble(explain(payload.error))
    } finally {
      setSending(false)
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

  return (
    <form
      onSubmit={(event) => void ask(event)}
      className="mt-8 rounded-xl border p-5"
      style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
    >
      <label htmlFor={emailId} className="block text-sm font-medium">
        {labels.emailLabel}
      </label>
      <p className="mt-1 text-xs" style={{ color: 'var(--quiet)' }}>
        {labels.emailHint}
      </p>

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

      <button
        type="submit"
        disabled={sending}
        className="mt-4 w-full rounded-md px-4 py-2 font-medium"
        style={{ background: 'var(--accent)', color: 'var(--ground)' }}
      >
        {sending ? labels.sendingLink : labels.sendLink}
      </button>

      {trouble === undefined ? null : (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--alarm)' }}>
          {labels[trouble]}
        </p>
      )}
    </form>
  )
}
