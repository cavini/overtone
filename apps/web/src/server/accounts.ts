import { checkPassword, type IdentityProvider, type Session } from '@overtone/core'
import { isInvited } from './invited.js'

/**
 * Making an account and entering one, with the rules in front of them.
 *
 * Not in the routes, because every rule here is a security rule and a route
 * is the one place in this codebase with no unit test of its own. The
 * provider is passed in rather than reached for, so all of this can be
 * tested against the fake — which the port's contract holds to the real
 * adapter's behaviour.
 */

export type AccountOutcome =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly code: string }

/**
 * One form of an address, so one person is one account.
 *
 * A phone keyboard capitalises the first letter and leaves a space on the
 * end, and neither is a different person — but the service would make them
 * a second account with a second library, and the first one's episodes
 * would simply not be there.
 */
const canonical = (email: string): string => email.trim().toLowerCase()

/**
 * Makes an account, if the address was invited.
 *
 * **Fails closed on an unset list**, unlike `isInvited`, whose
 * anybody-may-sign-in is right for entering an account that exists and
 * wrong for creating one. Uploading spends seconds of audio from a single
 * free-tier budget shared by every user (ADR 0020), so a deployment with no
 * list and an open registration form is that budget published to the
 * internet.
 */
export async function registerAccount(
  provider: IdentityProvider,
  email: string,
  password: string,
  allowList: string | undefined,
): Promise<AccountOutcome> {
  const address = canonical(email)

  // The same refusal for an uninvited address and an empty list: neither
  // answer should tell somebody whether a list exists or who is on it.
  const listed = (allowList ?? '').trim().length > 0
  if (!listed || !isInvited(address, allowList)) {
    return { ok: false, code: 'EMAIL_REJECTED' }
  }

  /*
   * Our rule before the service's. The refusal then arrives as a message
   * code the presenter renders in the reader's own language (ADR 0017) —
   * the service answers in English — and a password we can refuse ourselves
   * is one request the free tier keeps.
   */
  const problem = checkPassword(password)
  if (problem !== undefined) return { ok: false, code: problem.code }

  const outcome = await provider.register(address, password)

  return outcome.ok ? { ok: true, session: outcome.session } : { ok: false, code: outcome.failure.code }
}

/**
 * Enters an account.
 *
 * Every refusal is the same refusal. An unknown address, an address that
 * was never invited, one taken off the list since, and a wrong password all
 * answer `WRONG_EMAIL_OR_PASSWORD` — four different answers would make this
 * a way of asking who is in the group, from a page anybody can load.
 *
 * The list is checked here too, so removing somebody locks them out rather
 * than leaving an account that outlives the invitation behind it. An unset
 * list still lets an existing account in: that is the fresh-checkout bargain
 * the shared password made, and signing in needs an account something
 * already created.
 */
export async function signInWithPassword(
  provider: IdentityProvider,
  email: string,
  password: string,
  allowList: string | undefined,
): Promise<AccountOutcome> {
  const address = canonical(email)
  const refused = { ok: false, code: 'WRONG_EMAIL_OR_PASSWORD' } as const

  if (!isInvited(address, allowList)) return refused

  // Not `checkPassword`: the rule may have been shorter when this password
  // was set, and refusing a password that works would lock somebody out of
  // their own library to enforce a rule on a value they cannot see.
  if (password.length === 0) return refused

  const outcome = await provider.signIn(address, password)
  if (outcome.ok) return { ok: true, session: outcome.session }

  /*
   * Flattened to one answer. The service distinguishes some of these and the
   * contract requires that we do not — anything that is not a session is
   * "that pair does not work", except a service that is down, which is not
   * about this person at all.
   */
  return outcome.failure.code === 'PROVIDER_UNAVAILABLE'
    ? { ok: false, code: 'PROVIDER_UNAVAILABLE' }
    : refused
}
