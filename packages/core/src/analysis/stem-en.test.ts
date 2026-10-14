import { describe, expect, it } from 'vitest'
import { stemEnglish } from './stem-en.js'

describe('stemEnglish', () => {
  // The whole job: a word no dictionary holds, said in the singular once and
  // the plural the next time, counted as one term.
  it.each([
    ['podcasts', 'podcast'],
    ['memes', 'meme'],
    ['deploys', 'deploy'],
    ['guardachuvas', 'guardachuva'],
    ['streamers', 'streamer'],
  ])('groups the plural with the singular: %s -> %s', (surface, expected) => {
    expect(stemEnglish(surface)).toBe(expected)
  })

  /*
   * `-ies` drops only the `s`.
   *
   * The textbook rule is `-ies` → `-y`, and it is the wrong one here. This
   * runs only on words the dictionary does not hold, and the published list
   * does hold `stories`, `movies`, `cities` and every other established
   * noun. What reaches the fallback is new vocabulary — `selfies`,
   * `hoodies`, `newbies`, `foodies` — which is `-ie` plus `s` almost without
   * exception. `-y` would turn `selfies` into `selfy`.
   */
  it.each([
    ['selfies', 'selfie'],
    ['hoodies', 'hoodie'],
    ['newbies', 'newbie'],
  ])('reads -ies as a plural of -ie: %s -> %s', (surface, expected) => {
    expect(stemEnglish(surface)).toBe(expected)
  })

  // `-es` after a sibilant, where dropping both letters is unambiguous:
  // no English word ends in `-xe` or `-she`.
  it.each([
    ['boxes', 'box'],
    ['taxes', 'tax'],
    ['dishes', 'dish'],
    ['crashes', 'crash'],
  ])('drops -es after a sibilant: %s -> %s', (surface, expected) => {
    expect(stemEnglish(surface)).toBe(expected)
  })

  /*
   * Words that end in `s` without being plural.
   *
   * A stemmer that turns `news` into `new` or `analysis` into `analysi` is
   * wrong in a way nobody notices: the count stays plausible and the term is
   * nonsense. `-ss`, `-us` and `-is` are rules rather than list entries so
   * that `class`, `virus` and `basis` need no enumerating.
   */
  it.each(['news', 'series', 'species', 'physics', 'means'])('leaves %s alone', (surface) => {
    expect(stemEnglish(surface)).toBe(surface)
  })

  it.each(['class', 'boss', 'glass', 'virus', 'campus', 'bonus', 'basis', 'crisis', 'this'])(
    'leaves %s alone by rule rather than by list',
    (surface) => {
      expect(stemEnglish(surface)).toBe(surface)
    },
  )

  /*
   * Declines what it cannot do safely.
   *
   * `knives` and `leaves` need `f` or `fe` restored and the choice is not
   * recoverable from the spelling; the dictionary holds both. Guessing would
   * trade a visible gap for an invisible wrong answer, which is the trade
   * this whole pipeline refuses.
   */
  it.each(['knives', 'leaves', 'wolves'])('declines -ves rather than guessing: %s', (surface) => {
    expect(stemEnglish(surface)).toBe(surface)
  })

  // Verb morphology is the dictionary's job. A stemmer that took `-ing` and
  // `-ed` would fold `running` to `runn` and `interested` to `interest`,
  // merging a feeling with a rate of return.
  it.each(['running', 'played', 'talking', 'interested'])('does not touch %s', (surface) => {
    expect(stemEnglish(surface)).toBe(surface)
  })

  /*
   * A stop word is scaffolding, not a term to group.
   *
   * The English list holds inflected auxiliaries that end in `s` — `does`,
   * `has`, `its`, `was`. Without this guard `does` reduces to `doe`, which
   * is not a stop word, so a hidden auxiliary would reappear as a visible
   * term. The Portuguese stemmer needs no such guard: every plural stop word
   * it can reach reduces to another stop word, and its existing check on the
   * result catches them.
   */
  it.each(['does', 'theirs', 'yours', 'others'])('refuses to stem the stop word %s', (surface) => {
    expect(stemEnglish(surface)).toBe(surface)
  })

  it('never reduces a word to a stop word', () => {
    // `ans` would be `an`, `ifs` would be `if`.
    expect(stemEnglish('ans')).toBe('ans')
    expect(stemEnglish('alls')).toBe('alls')
  })

  it.each(['is', 'as', 'its', 'ads'])('is too short to be sure about: %s', (word) => {
    expect(stemEnglish(word)).toBe(word)
  })

  it('leaves a word that is not a plural at all', () => {
    expect(stemEnglish('podcast')).toBe('podcast')
    expect(stemEnglish('meme')).toBe('meme')
  })

  it('is idempotent, so re-analysis cannot drift', () => {
    for (const word of ['podcasts', 'boxes', 'selfies', 'news', 'knives', 'does']) {
      expect(stemEnglish(stemEnglish(word))).toBe(stemEnglish(word))
    }
  })
})
