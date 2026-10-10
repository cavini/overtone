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
  annotate(tokenise(normalize(text), 'pt'), lemmas, 'pt')

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
    const tokens = annotate(tokenise(normalize('hotdogs e pirão'), 'pt'), new Map(), 'pt')
    expect(tokens.map((t) => t.lemma)).toEqual(['hotdog', 'e', 'pirão'])
    expect(tokens.map((t) => t.lemmaSource)).toEqual(['stemmer', 'surface', 'surface'])
  })

  it('is deterministic', () => {
    const once = run('Falei do pirão e dos hotdogs')
    expect(JSON.stringify(run('Falei do pirão e dos hotdogs'))).toBe(JSON.stringify(once))
  })

  it('returns nothing for an empty stream', () => {
    expect(annotate([], DICTIONARY, 'pt')).toEqual([])
  })
})

describe('annotate, in English', () => {
  it('falls back to the English stemmer for a word no dictionary holds', () => {
    const [token] = annotate([{ surface: 'podcasts', index: 0 }], new Map(), 'en')

    expect(token?.lemma).toBe('podcast')
    expect(token?.lemmaSource).toBe('stemmer')
  })

  /*
   * The two stemmers disagree, and both are right about their own language.
   *
   * Portuguese leaves `podcasts` alone — its rules see no plural it
   * recognises — while English reduces it. `aviões` is the reverse. Using one
   * stemmer for both languages would mean one of them was always guessing.
   */
  it('uses the stemmer for the language it was told', () => {
    const asEnglish = annotate([{ surface: 'boxes', index: 0 }], new Map(), 'en')
    const asPortuguese = annotate([{ surface: 'boxes', index: 0 }], new Map(), 'pt')

    expect(asEnglish[0]?.lemma).toBe('box')
    expect(asPortuguese[0]?.lemma).toBe('boxe')
  })

  // The Portuguese corrections are evidence from Portuguese episodes. Applying
  // them to English would mean `cara` was "dude" in a language that does not
  // have the word.
  it('does not apply the Portuguese corrections to English', () => {
    expect(annotate([{ surface: 'cara', index: 0 }], new Map(), 'pt')[0]?.lemmaSource).toBe(
      'override',
    )
    expect(annotate([{ surface: 'cara', index: 0 }], new Map(), 'en')[0]?.lemmaSource).toBe(
      'surface',
    )
  })

  /*
   * The bundled list maps a feminine noun onto its masculine form, which is
   * the conventional citation form and the wrong answer here: this page says
   * what was said, and a daughter is not a son.
   */
  it('keeps a word apart from its other gender, whatever the dictionary says', () => {
    const [token] = annotate(
      [{ surface: 'menina', index: 0 }],
      new Map([['menina', 'menino']]),
      'pt',
    )

    expect(token).toMatchObject({ lemma: 'menina', lemmaSource: 'surface' })
  })

  // Falling through to the stemmer instead would give `menin`, which is not
  // a word either — the surface is the honest answer.
  it('does not stem the word it refused to fold', () => {
    const [token] = annotate([{ surface: 'nova', index: 0 }], new Map([['nova', 'novo']]), 'pt')
    expect(token?.lemma).toBe('nova')
  })

  it('still groups a verb with its infinitive', () => {
    const [token] = annotate([{ surface: 'fala', index: 0 }], new Map([['fala', 'falar']]), 'pt')
    expect(token).toMatchObject({ lemma: 'falar', lemmaSource: 'dictionary' })
  })

  /*
   * The bundled list is mechanically generated and maps plain nouns onto
   * infinitives that barely exist: `gato` onto `gatar`, `filho` onto
   * `filhar`, `bebê` onto `beber`. A quarter of all mentions on a real
   * episode were labelled with a word nobody had said.
   *
   * What separates an invented verb from a real one is a second source
   * containing only verbs. A lemma shaped like an infinitive, for a form
   * that source has never heard of, is an invention.
   */
  it('refuses a verb lemma for a word that is not a verb form', () => {
    const [token] = annotate(
      [{ surface: 'gato', index: 0 }],
      new Map([['gato', 'gatar']]),
      'pt',
      // Loaded, and `gato` is not in it.
      new Set(['fala', 'falou']),
    )

    expect(token).toMatchObject({ lemma: 'gato', lemmaSource: 'surface' })
  })

  it('keeps a verb lemma for a word that really is one', () => {
    const [token] = annotate(
      [{ surface: 'fala', index: 0 }],
      new Map([['fala', 'falar']]),
      'pt',
      new Set(['fala']),
    )

    expect(token).toMatchObject({ lemma: 'falar', lemmaSource: 'dictionary' })
  })

  // Only lemmas shaped like an infinitive are suspect. A plural folding
  // into its singular is not, and neither is anything else.
  it('leaves a lemma that is not shaped like an infinitive alone', () => {
    const [token] = annotate(
      [{ surface: 'filhos', index: 0 }],
      new Map([['filhos', 'filho']]),
      'pt',
      new Set(['fala']),
    )

    expect(token?.lemma).toBe('filho')
  })

  // Knowing nothing is not the same as knowing it is not a verb. With no
  // second source the dictionary is all there is, and it was right more
  // often than not.
  it('trusts the dictionary when there is no second source at all', () => {
    const [token] = annotate([{ surface: 'gato', index: 0 }], new Map([['gato', 'gatar']]), 'pt')

    expect(token?.lemma).toBe('gatar')
  })

  /*
   * The guard that matters. Portuguese speech always contains verb forms,
   * so nothing matching across a whole episode means the table was never
   * loaded — not that the language has no verbs. Read the other way it
   * rejects every verb lemma and destroys the grouping the dictionary
   * exists for. It did exactly that in the integration suite the first
   * time this ran.
   */
  it('treats an empty verb list as a missing one, not as a language with no verbs', () => {
    const [token] = annotate(
      [{ surface: 'fala', index: 0 }],
      new Map([['fala', 'falar']]),
      'pt',
      new Set(),
    )

    expect(token?.lemma).toBe('falar')
  })
})
