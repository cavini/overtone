'use client'

import type { Locale } from '@overtone/messages'
import { useId, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'

type Labels = Record<UiKey, string>

/** Which label explains each refusal the server can send back. */
const TROUBLE: Record<string, UiKey> = {
  LINK_EXPIRED: 'linkExpired',
  EMAIL_REJECTED: 'emailRejected',
  TOO_MANY_LINKS: 'tooManyLinks',
  PROVIDER_UNAVAILABLE: 'signInUnavailable',
}

/**
 * Asks for a sign-in link.
 *
 * Says the same thing whether or not the address is already known. An
 * answer that differed would turn this form into a way of finding out who
 * is in the group, for anybody who can load the page.
 */
export function SignInForm({ locale, labels }: { readonly locale: Locale; readonly labels: Labels }) {
  const emailId = useId()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [trouble, setTrouble] = useState<UiKey | undefined>(undefined)

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

      setTrouble(TROUBLE[payload.error ?? ''] ?? 'signInUnavailable')
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
