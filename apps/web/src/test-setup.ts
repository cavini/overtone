import { afterEach } from 'vitest'

/**
 * Unmounts what a test rendered, between tests.
 *
 * Testing Library does this by itself only when Vitest runs with globals on,
 * and this project does not. Without it the second test in a file queries a
 * document still holding the first one's markup, and the failure reads as
 * "found multiple elements" rather than "nothing was cleaned up".
 *
 * `setupFiles` runs for every test, including the node-environment ones that
 * have no DOM, so the import is deferred and skipped where it would have
 * nothing to unmount.
 */
afterEach(async () => {
  if (typeof document === 'undefined') return

  const { cleanup } = await import('@testing-library/react')
  cleanup()
})
