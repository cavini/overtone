// US-015 · keeping filler and function words out of the way
//
// The English lists have had a suite since they were written. The
// Portuguese ones — the language the show is actually in — had none, so
// every property the English tests check was unchecked on the list that
// does the real work.
import { describe, expect, it } from 'vitest'
import { splitEnclitics } from './enclitics.js'
import { normalize } from './normalize.js'
import { FILLERS_EN, STOP_WORDS_EN } from './vocabulary-en.js'
import { FILLERS, STOP_WORDS } from './vocabulary.js'

describe('the Portuguese stop words', () => {
  it('covers the function words that dominate any frequency list', () => {
    for (const word of ['de', 'que', 'e', 'o', 'a', 'do', 'da', 'em', 'um', 'para', 'com', 'não']) {
      expect(STOP_WORDS.has(word), `${word} is missing`).toBe(true)
    }
  })

  /*
   * Spoken Brazilian, not written: `tá`, `tô`, `pra`, `cê` are what the
   * transcriber actually produces, and a list of only the written forms
   * would leave them at the top of every chart.
   */
  it('covers the spoken contractions, not just the written forms', () => {
    for (const word of ['tá', 'tô', 'pra', 'pro', 'cê', 'tão']) {
      expect(STOP_WORDS.has(word), `${word} is missing`).toBe(true)
    }
  })

  /*
   * The tokeniser splits enclitics into separate tokens, so every one of
   * them becomes a word in its own right. Any that is not a stop word
   * arrives at the top of the chart as a discovery about nothing.
   */
  it('covers every enclitic the tokeniser splits off', () => {
    const clitics = ['diga-me', 'leva-te', 'faz-se', 'deu-lhe', 'dá-lho', 'vamo-nos', 'ide-vos',
      'fazê-lo', 'vê-la', 'pô-los', 'tê-las', 'dão-no', 'põe-na']
      .flatMap((word) => splitEnclitics(word).slice(1))

    const uncovered = [...new Set(clitics)].filter((clitic) => !STOP_WORDS.has(clitic))
    expect(uncovered, 'enclitics that would show up as top words').toEqual([])
  })

  /*
   * Stored in the form tokens arrive in. An entry that is not already
   * normalised — an uppercase letter, or a decomposed accent that looks
   * identical on screen — simply never matches, and the word it was meant
   * to filter sits at the top of the chart with nothing to explain it.
   */
  it.each([
    ['stop words', STOP_WORDS],
    ['fillers', FILLERS],
  ])('stores %s in the form tokens arrive in', (_what, list) => {
    const unnormalised = [...list].filter((word) => normalize(word) !== word)
    expect(unnormalised).toEqual([])
  })

  it('leaves the words the show is about countable', () => {
    for (const word of ['piada', 'episódio', 'caralho', 'buceta', 'jabuticaba']) {
      expect(STOP_WORDS.has(word), `${word} was filtered out`).toBe(false)
    }
  })

  it('is not the English list by accident', () => {
    expect(STOP_WORDS.has('the')).toBe(false)
    expect(STOP_WORDS_EN.has('que')).toBe(false)
  })
})

describe('the Portuguese fillers', () => {
  it('covers the non-lexical vocalisations', () => {
    for (const sound of ['eh', 'ah', 'hum', 'hmm', 'uhum']) {
      expect(FILLERS.has(sound), `${sound} is missing`).toBe(true)
    }
  })

  /*
   * `né`, `tipo`, `cara` and `sabe` are real words with real counts.
   * "You said *tipo* four hundred times this season" is an insight, not
   * noise, so calling them filler would delete the finding.
   */
  it('leaves discourse markers out, because they are words', () => {
    for (const word of ['né', 'tipo', 'cara', 'sabe', 'é']) {
      expect(FILLERS.has(word), `${word} was treated as a noise`).toBe(false)
    }
  })

  // A word in both lists is filtered twice and explained by neither.
  it('does not also claim to be a stop word', () => {
    const both = [...FILLERS].filter((sound) => STOP_WORDS.has(sound))
    expect(both).toEqual([])
  })

  it('keeps separate lists from the English ones', () => {
    expect([...FILLERS].filter((sound) => !FILLERS_EN.has(sound)).length).toBeGreaterThan(0)
  })
})
