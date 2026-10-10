import { describe, expect, it } from 'vitest'
import { PACKED_LANGUAGES, languagePack } from './language-pack.js'
import { COLLOQUIAL_LEMMAS } from './colloquial.js'
import { FILLERS_EN, STOP_WORDS_EN } from './vocabulary-en.js'
import { FILLERS, STOP_WORDS } from './vocabulary.js'

describe('languagePack', () => {
  it('has a pack for every language it claims to cover', () => {
    for (const language of PACKED_LANGUAGES) {
      expect(languagePack(language), language).toBeDefined()
    }
  })

  it('covers the two languages the show is recorded in', () => {
    expect([...PACKED_LANGUAGES].sort()).toEqual(['en', 'pt'])
  })

  describe('Portuguese', () => {
    const pt = languagePack('pt')

    // The regression guard for every existing count. Portuguese analysis must
    // behave exactly as it did before there was a second language, so each
    // piece is the same object the pipeline used when those numbers were
    // written.
    it('is assembled from the lists that produced the counts already stored', () => {
      expect(pt.stopWords).toBe(STOP_WORDS)
      expect(pt.fillers).toBe(FILLERS)
      expect(pt.overrides).toBe(COLLOQUIAL_LEMMAS)
    })

    it('splits enclitics', () => {
      expect(pt.splitWord('diga-me')).toEqual(['diga', 'me'])
    })

    it('keeps genuine compounds whole', () => {
      expect(pt.splitWord('guarda-chuva')).toEqual(['guarda-chuva'])
    })

    it('stems Portuguese plurals', () => {
      expect(pt.stem('hotdogs')).toBe('hotdog')
      expect(pt.stem('aviões')).toBe('avião')
    })

    it('names the Postgres configuration for the language', () => {
      expect(pt.textSearchConfiguration).toBe('portuguese')
    })
  })

  describe('English', () => {
    const en = languagePack('en')

    it('is assembled from the English lists', () => {
      expect(en.stopWords).toBe(STOP_WORDS_EN)
      expect(en.fillers).toBe(FILLERS_EN)
    })

    it('splits contractions instead of enclitics', () => {
      expect(en.splitWord("it's")).toEqual(['it', 's'])
    })

    /*
     * A hyphen is not a clitic marker in English, so nothing splits on one.
     *
     * The harm in running the Portuguese splitter over English is not the
     * hyphen — the two rules rarely collide — it is that it would leave
     * `it's`, `that's` and `don't` joined. None of those is on the English
     * stop-word list in that shape, so every one of them would arrive at the
     * top of the frequency list as a countable word.
     */
    it('leaves a hyphenated English word whole', () => {
      expect(en.splitWord('check-in')).toEqual(['check-in'])
      expect(en.splitWord('add-on')).toEqual(['add-on'])
      expect(en.splitWord('voice-over')).toEqual(['voice-over'])
    })

    it('stems English plurals', () => {
      expect(en.stem('podcasts')).toBe('podcast')
      expect(en.stem('news')).toBe('news')
    })

    /*
     * No colloquial overrides yet, and that is a statement rather than an
     * omission. Every Portuguese entry was found in a real episode — `cara`
     * was the most-said word of one and the dictionary called it
     * "expensive". There is no English episode to learn from, and inventing
     * corrections for a register nobody has recorded would be guessing where
     * the Portuguese list is evidence.
     */
    it('has no hand-written corrections, because none have been earned', () => {
      expect(en.overrides).toEqual({})
    })

    it('names the Postgres configuration for the language', () => {
      expect(en.textSearchConfiguration).toBe('english')
    })
  })

  // The two packs must not share anything mutable or a change to one would
  // silently move the other's numbers.
  it('gives each language its own lists', () => {
    expect(languagePack('pt').stopWords).not.toBe(languagePack('en').stopWords)
    expect(languagePack('pt').stem).not.toBe(languagePack('en').stem)
    expect(languagePack('pt').splitWord).not.toBe(languagePack('en').splitWord)
  })
})
