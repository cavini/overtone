/**
 * The current time.
 *
 * A port rather than a direct call to `Date.now()`, because `packages/core`
 * must stay deterministic: the same inputs have to produce the same counts,
 * and a snapshot test cannot assert against a timestamp that moves. It also
 * makes every allowance-window boundary testable, which matters when the
 * pacing logic turns on exactly those boundaries.
 */
export interface Clock {
  now(): number
}
