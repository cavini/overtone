// US-004 · domain decision D3
import { describe, expect, it } from 'vitest'
import { tokenise } from './tokenise.js'

const surfaces = (text: string): string[] => tokenise(text, 'pt').map((t) => t.surface)

describe('tokenise', () => {
  it('splits on whitespace', () => {
    expect(surfaces('o feijão está pronto')).toEqual(['o', 'feijão', 'está', 'pronto'])
  })

  it('numbers the tokens in order', () => {
    expect(tokenise('um dois três', 'pt').map((t) => t.index)).toEqual([0, 1, 2])
  })

  it('returns nothing for empty input', () => {
    expect(tokenise('', 'pt')).toEqual([])
  })

  // Enclitic pronouns are separate words wearing a hyphen. The verb is what
  // gets counted; the pronoun belongs in the stop-word list.
  it.each([
    ['diga-me', ['diga', 'me']],
    ['fazê-lo', ['fazê', 'lo']],
    ['dá-se', ['dá', 'se']],
    ['vamo-nos', ['vamo', 'nos']],
    ['disse-lhe', ['disse', 'lhe']],
    ['comprá-la', ['comprá', 'la']],
  ])('splits the enclitic in %s', (word, expected) => {
    expect(surfaces(word)).toEqual(expected)
  })

  it('splits a chain of enclitics', () => {
    expect(surfaces('diga-me-lo')).toEqual(['diga', 'me', 'lo'])
  })

  // Compounds are one word. They survive without a dictionary because the
  // clitic list is closed and only the final segment is ever considered.
  it.each([
    'guarda-chuva',
    'segunda-feira',
    'couve-flor',
    'arco-íris',
    'porta-malas',
    'recém-nascido',
  ])('keeps the compound %s whole', (word) => {
    expect(surfaces(word)).toEqual([word])
  })

  // `te` is a clitic, but only a trailing segment is tested, so this bird
  // keeps its name.
  it('keeps bem-te-vi whole because the last segment is not a clitic', () => {
    expect(surfaces('bem-te-vi')).toEqual(['bem-te-vi'])
  })

  // `o a os as` are deliberately absent from the clitic list: as enclitics
  // they are indistinguishable from the second half of a compound, so the
  // conservative reading wins and the token stays whole.
  it.each(['dá-o', 'leva-a', 'comprou-os'])('leaves %s alone', (word) => {
    expect(surfaces(word)).toEqual([word])
  })

  it('treats a mandatory contraction as one token', () => {
    expect(surfaces('na casa do vizinho pelo sol')).toEqual([
      'na', 'casa', 'do', 'vizinho', 'pelo', 'sol',
    ])
  })

  it('keeps an apostrophe inside a word', () => {
    expect(surfaces("d'água")).toEqual(["d'água"])
  })

  it('does not split a bare hyphen or a trailing one', () => {
    expect(surfaces('bem - mal')).toEqual(['bem', 'mal'])
  })

  it('discards a fragment left with no letters after splitting', () => {
    expect(surfaces('--me')).toEqual(['me'])
  })
})

describe('tokenise, in English', () => {
  const english = (text: string): string[] => tokenise(text, 'en').map((t) => t.surface)

  it('splits a contraction into the words it is', () => {
    expect(english("it's a podcast")).toEqual(['it', 's', 'a', 'podcast'])
  })

  it('keeps a contracted negative whole, because the stop-word list holds it', () => {
    expect(english("i don't know")).toEqual(['i', "don't", 'know'])
  })

  // English hyphens join words rather than attaching pronouns, so nothing
  // splits on one.
  it('leaves a hyphenated word alone', () => {
    expect(english('a check-in and a voice-over')).toEqual([
      'a', 'check-in', 'and', 'a', 'voice-over',
    ])
  })

  /*
   * Each rule stays on its own side.
   *
   * The Portuguese splitter would leave `it's` joined, and nothing on the
   * English stop-word list matches it in that shape, so it would arrive at
   * the top of the frequency list as a countable word. The English splitter
   * run on Portuguese would leave `diga-me` joined for the same reason.
   */
  it('does not apply the Portuguese rule', () => {
    expect(tokenise('diga-me', 'en').map((t) => t.surface)).toEqual(['diga-me'])
    expect(tokenise("it's", 'pt').map((t) => t.surface)).toEqual(["it's"])
  })
})
