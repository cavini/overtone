/**
 * What the command line asked for.
 *
 * Its own module so it can be tested: `main.ts` is the composition root and
 * reads the world, so nothing in it is reachable from a test — and this is
 * the part with a decision in it.
 */
export interface Asked {
  /** Absent means "whatever `OVERTONE_FEED_SHOW` says". */
  readonly show?: string
  /** Absent means the default. */
  readonly howMany?: number
}

const isDigits = (value: string): boolean => /^\d+$/u.test(value)

function countFrom(value: string): number {
  const howMany = Number(value)
  if (!Number.isInteger(howMany) || howMany <= 0) {
    throw new Error(`"${value}" is not a number of episodes`)
  }

  return howMany
}

/**
 * Reads `[show] [how-many]`, and forgives the obvious mistake.
 *
 * `pnpm backfill 10` is what somebody types when the show is already in the
 * environment, and it used to be read as a show *named* "10" — which matches
 * nothing in the feed, so the run reported "0 to do now" and stopped, looking
 * exactly like a finished catalogue. A lone number is a count.
 *
 * A show whose name really is digits can still be asked for, by giving both
 * arguments.
 */
export function readArguments(args: readonly string[]): Asked {
  const first = args[0]?.trim() ?? ''
  const second = args[1]?.trim()

  // A lone number is how many, not which show.
  if (second === undefined && isDigits(first)) return { howMany: countFrom(first) }

  return {
    ...(first.length === 0 ? {} : { show: first }),
    ...(second === undefined ? {} : { howMany: countFrom(second) }),
  }
}
