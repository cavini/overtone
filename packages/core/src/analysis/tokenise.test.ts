// US-004 · domain decision D3
import { describe, expect, it } from 'vitest'
import { tokenise } from './tokenise.js'

const surfaces = (text: string): string[] => tokenise(text).map((t) => t.surface)

describe('tokenise', () => {
  it('splits on whitespace', () => {
    expect(surfaces('o pirão está pronto')).toEqual(['o', 'pirão', 'está', 'pronto'])
  })

  it('numbers the tokens in order', () => {
    expect(tokenise('um dois três').map((t) => t.index)).toEqual([0, 1, 2])
  })

  it('returns nothing for empty input', () => {
    expect(tokenise('')).toEqual([])
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
