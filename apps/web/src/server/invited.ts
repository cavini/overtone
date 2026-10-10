/**
 * Whether an address is one of the group's.
 *
 * The shared password this replaces was never about privacy — the group's
 * episodes are not secret from each other. It was about the **allowance**:
 * uploading spends seconds of audio from one free-tier budget of three
 * episodes a day, shared by everyone (ADR 0020). Sign-in that anybody can
 * complete is that budget, open to the internet.
 *
 * So the list is the invitation. Unset means no list and anybody may sign
 * in, deliberately, so a fresh checkout runs with no setup — the same
 * bargain the password made.
 *
 * Compared case-insensitively and trimmed, because an address typed into a
 * phone keyboard arrives capitalised and with a space on the end, and
 * neither is a different person.
 */
export function isInvited(email: string, allowList: string | undefined): boolean {
  const allowed = (allowList ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)

  if (allowed.length === 0) return true

  return allowed.includes(email.trim().toLowerCase())
}
