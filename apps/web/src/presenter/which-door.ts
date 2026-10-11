/** Which way in the screen should offer. */
export type Door = 'password' | 'link'

/**
 * The door on the screen has to be the one that is open.
 *
 * Magic-link sign-in needs an email provider configured before it can
 * deliver to anybody but the project owner (ADR 0028). Until that is done
 * the shared password is the only way in, and the page must say so — the
 * alternative, and what shipped, is a form that asks for an address and
 * then silently sends nothing.
 */
export function whichDoor(sharedPassword: string | undefined): Door {
  return sharedPassword === undefined || sharedPassword.trim().length === 0 ? 'link' : 'password'
}
