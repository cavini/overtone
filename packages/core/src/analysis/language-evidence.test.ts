// US-013
//
// The check that costs nothing. A language detected from the audio is still
// a guess, and this is the one way to test it against the thing it claims to
// be about — the words that came back — without spending a second of the
// transcription allowance on a second opinion.
import { describe, expect, it } from 'vitest'
import { languagePack } from './language-pack.js'
import { MIN_STOP_WORD_EVIDENCE, languageFromStopWords } from './language-evidence.js'

describe('what the words themselves say the language was', () => {
  it('reads Portuguese speech as Portuguese', () => {
    const said = 'o que ele disse não era o que eu queria ouvir sobre isso'

    expect(languageFromStopWords(said).language).toBe('pt')
  })

  it('reads English speech as English', () => {
    const said = 'the thing is that it was not the kind of show we were going to make'

    expect(languageFromStopWords(said).language).toBe('en')
  })

  /*
   * The whole reason this works on two lists that overlap.
   *
   * `a`, `as`, `do`, `no` and `me` are function words in both languages, so
   * a hit on one of them is not evidence of anything — counted naively it
   * is evidence of *both*, which on a short probe is enough to swing the
   * verdict. They are the only five, so discarding them costs 5 words of
   * 279 and 255 and leaves the signal intact.
   */
  it('ignores the words that are function words in both', () => {
    const shared = [...languagePack('pt').stopWords].filter((word) =>
      languagePack('en').stopWords.has(word),
    )

    const verdict = languageFromStopWords(shared.join(' ').repeat(20))

    expect(verdict.pt).toBe(0)
    expect(verdict.en).toBe(0)
    expect(verdict.language).toBeUndefined()
  })

  /*
   * This show says `deploy`, `podcast`, `player` and `hype` constantly
   * (ADR 0023), which is exactly the passage a detector mishears. A
   * loanword is nobody's stop word, so it does not get a vote.
   */
  it('is not swayed by the English this show borrows', () => {
    const said =
      'o deploy do podcast não funcionou e o player travou de novo, e eu não sei ' +
      'se o problema é do cache ou se é o build que está quebrado'

    expect(languageFromStopWords(said).language).toBe('pt')
  })

  // A chunk of music or silence comes back with almost no words in it. It
  // must decline to answer rather than vote on three.
  it('declines when there is barely anything to go on', () => {
    expect(languageFromStopWords('yeah').language).toBeUndefined()
    expect(languageFromStopWords('').language).toBeUndefined()
  })

  it('declines when the two are too close to call', () => {
    const verdict = languageFromStopWords('o que não the of is')

    expect(verdict.language).toBeUndefined()
  })

  it('needs more than a handful of function words before it will say', () => {
    expect(MIN_STOP_WORD_EVIDENCE).toBeGreaterThan(3)
  })

  // Accents are never stripped anywhere in this pipeline, and the
  // Portuguese list is full of them. Folding `não` to `nao` here would
  // quietly cost the single most common word in the language.
  it('matches an accented stop word as it was written', () => {
    expect(languageFromStopWords('não é só isso que ele está até aqui').pt).toBeGreaterThan(3)
  })
})
