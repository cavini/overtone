/**
 * A running joke, or anything else the group wants counted.
 *
 * `patterns` is a set rather than a single string because people think in
 * concepts, not spellings: the same bit shows up as `hotdog`, `hot dog` and
 * `pão com salsicha`, and all three are the same thing to the people saying
 * them. Matching is separator-insensitive, so the first two collapse
 * automatically; the third has to be written down.
 *
 * Topics are defined by the group, not discovered by a model. That keeps a
 * count exact, explicable, and stable across episodes — a machine-found
 * cluster means something different every episode, which makes a trend
 * meaningless.
 */
export interface Topic {
  readonly id: string
  readonly name: string
  readonly patterns: readonly string[]
}
