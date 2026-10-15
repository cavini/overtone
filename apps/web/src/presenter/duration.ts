/**
 * A wait, broken into the parts a person would say out loud.
 *
 * The countdown used to be minutes and seconds with no hour rollover, so a
 * wait for the daily allowance to refill read as **868:23** — a number
 * nobody can turn into a time without dividing by sixty in their head. The
 * waits here are genuinely that long: the free tier refills eight audio-hours
 * a day, so an episode uploaded after the day's are spent waits until
 * tomorrow.
 *
 * Numbers only. Which words go around them — `h`, `min`, `seg` or `s` — is
 * the presenter's business and lives in the interface catalogue, because
 * nothing below it knows which language the reader is using (ADR 0017).
 */
export interface DurationParts {
  readonly hours?: number
  readonly minutes?: number
  readonly seconds?: number
}

/**
 * Hours, minutes and seconds, leaving out whatever there is none of.
 *
 * Absent rather than zero, so the component has nothing to render for an
 * empty part and no rule of its own about when to — "3h" rather than
 * "3h 0min 0s", and the decision made in one place.
 *
 * The exception is a wait that is over, which answers zero seconds: an empty
 * set of parts would draw a label with a blank after it.
 */
export function splitDuration(ms: number): DurationParts {
  // Up, because a countdown that reaches zero while the wait is still on
  // reads as broken.
  const total = Math.max(0, Math.ceil(ms / 1000))
  if (total === 0) return { seconds: 0 }

  const hours = Math.floor(total / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const seconds = total % 60

  return {
    ...(hours === 0 ? {} : { hours }),
    ...(minutes === 0 ? {} : { minutes }),
    ...(seconds === 0 ? {} : { seconds }),
  }
}
