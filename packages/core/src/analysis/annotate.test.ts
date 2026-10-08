// US-016 · domain decision D4
import { describe, expect, it } from 'vitest'
import { annotate } from './annotate.js'
import { normalize } from './normalize.js'
import { tokenise } from './tokenise.js'

const DICTIONARY: ReadonlyMap<string, string> = new Map([
  ['falei', 'falar'],
  ['falando', 'falar'],
  ['falar', 'falar'],
  ['comer', 'comer'],
  ['comi', 'comer'],
  ['casas', 'casa'],
  ['casar', 'casar'],
])

const run = (text: string, lemmas = DICTIONARY) =>
  annotate(tokenise(normalize(text)), lemmas)

describe('annotate', () => {
  it('prefers the dictionary', () => {
    const [token] = run('falei')
    expect(token?.lemma).toBe('falar')
    expect(token?.lemmaSource).toBe('dictionary')
  })

  it('groups every inflection onto one lemma', () => {
    const lemmas = run('Falei, estou falando e vou falar').map((t) => t.lemma)
    expect(lemmas.filter((l) => l === 'falar')).toHaveLength(3)
  })

  // The dictionary is what keeps these apart. A stemmer would fold both to
  // `cas`, merging "house" with "to marry".
  it('keeps casa and casar distinct', () => {
    expect(run('casas').map((t) => t.lemma)).toEqual(['casa'])
    expect(run('casar').map((t) => t.lemma)).toEqual(['casar'])
  })

  it('falls back to the stemmer for words it has never seen', () => {
    const [token] = run('hotdogs')
    expect(token?.lemma).toBe('hotdog')
    expect(token?.lemmaSource).toBe('stemmer')
  })

  it('keeps the surface when neither the dictionary nor the stemmer helps', () => {
    const [token] = run('pirão')
    expect(token?.lemma).toBe('pirão')
    expect(token?.lemmaSource).toBe('surface')
  })

  it('classifies while it annotates', () => {
    const classes = run('o pirão eh').map((t) => t.tokenClass)
    expect(classes).toEqual(['stopword', 'word', 'filler'])
  })

  it('carries the surface and index through untouched', () => {
    const tokens = run('falei do pirão')
    expect(tokens.map((t) => t.surface)).toEqual(['falei', 'do', 'pirão'])
    expect(tokens.map((t) => t.index)).toEqual([0, 1, 2])
  })

  it('works with no dictionary at all', () => {
    const tokens = annotate(tokenise(normalize('hotdogs e pirão')), new Map())
    expect(tokens.map((t) => t.lemma)).toEqual(['hotdog', 'e', 'pirão'])
    expect(tokens.map((t) => t.lemmaSource)).toEqual(['stemmer', 'surface', 'surface'])
  })

  it('is deterministic', () => {
    const once = run('Falei do pirão e dos hotdogs')
    expect(JSON.stringify(run('Falei do pirão e dos hotdogs'))).toBe(JSON.stringify(once))
  })

  it('returns nothing for an empty stream', () => {
    expect(annotate([], DICTIONARY)).toEqual([])
  })
})
