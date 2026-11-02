// US-013
import { describe, expect, it } from 'vitest'
import { settleLanguage } from './settle-language.js'

describe('settling what the probes heard into one answer', () => {
  it('takes the language every probe agreed on', () => {
    expect(settleLanguage(['pt', 'pt', 'pt'])).toBe('pt')
    expect(settleLanguage(['en', 'en', 'en'])).toBe('en')
  })

  /*
   * The case the three probes exist for. One window landing on a music
   * sting, an English anecdote or a read-out quote is outvoted instead of
   * deciding the episode.
   */
  it('outvotes a single window that heard something else', () => {
    expect(settleLanguage(['pt', 'en', 'pt'])).toBe('pt')
  })

  // A probe that failed is not a vote for anything. Counting it as one would
  // let two network errors hand the episode to whichever window answered.
  it('does not let a failed probe vote', () => {
    expect(settleLanguage(['pt', undefined, 'pt'])).toBe('pt')
  })

  /*
   * Evenly split is the one outcome where guessing is worse than stopping.
   *
   * It is also the shape a genuinely bilingual recording makes, and that is
   * an episode this pipeline cannot analyse correctly either way — one
   * language pack is chosen for the whole thing.
   */
  it('refuses to break a tie', () => {
    expect(settleLanguage(['pt', 'en'])).toBeUndefined()
    expect(settleLanguage(['pt', 'en', 'pt', 'en'])).toBeUndefined()
  })

  it('has nothing to settle when nothing was heard', () => {
    expect(settleLanguage([])).toBeUndefined()
    expect(settleLanguage([undefined, undefined])).toBeUndefined()
  })

  /*
   * One probe decides when one probe is all there was.
   *
   * `planLanguageProbes` only asks for a single window when the audio is too
   * short to hold three apart, and for a clip that short one opinion is
   * genuinely all the evidence there is. Refusing here would make short
   * audio undetectable rather than carefully handled.
   */
  it('accepts the only answer there was', () => {
    expect(settleLanguage(['en'])).toBe('en')
  })
})
