// US-016 · ADR 0019
import { describe, expect, it } from 'vitest'
import { parseLemmaList } from './parse-lemma-list.js'

const asMap = (text: string) => new Map(parseLemmaList(text, 'pt'))

describe('parseLemmaList', () => {
  // The published format is lemma first, token second. Getting this round the
  // wrong way would map every word to an inflection of itself and look
  // almost plausible, which is the worst kind of wrong.
  it('reads the published order: lemma, tab, token', () => {
    expect(asMap('falar\tfalei').get('falei')).toBe('falar')
  })

  it('maps every inflection onto its lemma', () => {
    const map = asMap(['falar\tfalei', 'falar\tfalando', 'falar\tfalou'].join('\n'))
    expect([...map.entries()].sort()).toEqual([
      ['falando', 'falar'],
      ['falei', 'falar'],
      ['falou', 'falar'],
    ])
  })

  it('normalises both sides so lookups match the analysis pipeline', () => {
    const map = asMap('Gravação\tGRAVAÇÕES')
    expect(map.get('gravações')).toBe('gravação')
  })

  it('keeps accents', () => {
    expect(asMap('pôr\tpôs').get('pôs')).toBe('pôr')
  })

  it('skips blank and malformed lines rather than failing the whole load', () => {
    const map = asMap(
      ['falar\tfalei', '', '   ', 'no-tab-here', '\tempty-lemma', 'empty-token\t'].join('\n'),
    )
    expect(map.size).toBe(1)
    expect(map.get('falei')).toBe('falar')
  })

  it('tolerates windows line endings', () => {
    expect(asMap('falar\tfalei\r\nfalar\tfalou\r\n').size).toBe(2)
  })

  // A row whose form is already its own lemma is usually redundant, because
  // a lookup miss falls through to the stemmer, which leaves the word alone.
  it('drops an identity row the stemmer handles anyway', () => {
    expect(asMap('casa\tcasa').size).toBe(0)
  })

  // Except when it is not redundant. `país` is its own lemma, and the
  // stemmer — seeing a word that ends in `s` — would cut it to `paí`. This
  // row is the only thing preventing that.
  it('keeps an identity row the stemmer would corrupt', () => {
    expect(asMap('país\tpaís').get('país')).toBe('país')
  })

  it('keeps a real reduction even when the stemmer would agree', () => {
    // Provenance matters: a dictionary grouping is exact, and the UI marks a
    // stemmed one as a guess. Dropping this would mislabel it.
    expect(asMap('casa\tcasas').get('casas')).toBe('casa')
  })

  // The published file holds no identity row for `país` — it only appears as
  // the lemma of `países`. Left out of the dictionary, `país` would fall
  // through to the stemmer, which cuts any word ending in `s`, and be counted
  // as `paí`. 246 known lemmas are exposed this way, so the dictionary is
  // made authoritative for every word it knows.
  it('protects a lemma the stemmer would corrupt, even with no identity row', () => {
    const map = asMap('país\tpaíses')
    expect(map.get('países')).toBe('país')
    expect(map.get('país')).toBe('país')
  })

  it('adds no protective row where the stemmer already agrees', () => {
    const map = asMap('casa\tcasas')
    expect(map.get('casas')).toBe('casa')
    expect(map.has('casa')).toBe(false)
  })

  it('takes the first mapping when a form appears twice', () => {
    const map = asMap(['falar\tfalou', 'falhar\tfalou'].join('\n'))
    expect(map.get('falou')).toBe('falar')
  })

  // The published file starts with a byte-order mark, which would otherwise
  // ride along on the first entry's lemma.
  it('strips a byte-order mark', () => {
    expect(asMap('\uFEFFfalar\tfalei').get('falei')).toBe('falar')
  })

  // The source is community-maintained and has some junk in it — the real
  // file's first row maps a word to "00". A lemma with no letters in it is
  // not a word, and a transcript will never match it, so it is dropped
  // rather than stored.
  it('drops a row with no letters on either side', () => {
    expect(asMap('00\tiodargírios').size).toBe(0)
    expect(asMap('falar\t123').size).toBe(0)
  })

  it('handles an empty file', () => {
    expect(parseLemmaList('', 'pt')).toEqual([])
  })

  it('is deterministic', () => {
    const text = ['falar\tfalei', 'casa\tcasas', 'país\tpaís'].join('\n')
    expect(parseLemmaList(text, 'pt')).toEqual(parseLemmaList(text, 'pt'))
  })
})

describe('parseLemmaList, for English', () => {
  it('reads the same published format', () => {
    const map = new Map(parseLemmaList(['be\twas', 'be\twere', 'go\twent'].join('\n'), 'en'))

    expect(map.get('was')).toBe('be')
    expect(map.get('were')).toBe('be')
    expect(map.get('went')).toBe('go')
  })

  /*
   * An identity row is dropped only when the stemmer independently agrees
   * (ADR 0019), so the pruning has to consult the stemmer that will actually
   * run at lookup time. `news` is its own lemma: the English stemmer leaves
   * it alone, so the row is redundant and goes. Pruned against the
   * *Portuguese* stemmer, which cuts `news` to `new`, the same row looks
   * load-bearing and is kept — and the English half of the dictionary fills
   * with rows protecting it from a stemmer that will never see it.
   */
  it('prunes against the stemmer the language will use', () => {
    expect(parseLemmaList('news\tnews', 'en')).toEqual([])
    expect(parseLemmaList('news\tnews', 'pt')).toEqual([['news', 'news']])
  })

  /*
   * English needs far fewer protective rows than Portuguese, because the
   * English stemmer guards most singular `-s` nouns by rule rather than by
   * list: `-ss`, `-us` and `-is` cover `glass`, `virus` and `analysis`
   * between them. `bias` is safe without a row of its own, where `país`
   * needed one.
   */
  it('adds no row for a lemma the stemmer already leaves alone', () => {
    const pairs = parseLemmaList('bias\tbiases', 'en')

    expect(pairs).toContainEqual(['biases', 'bias'])
    expect(new Map(pairs).get('bias')).toBeUndefined()
  })

  // And the other half of the rule still applies where the rules run out.
  it('protects a lemma the stemmer would cut', () => {
    const map = new Map(parseLemmaList('headquarters\theadquarter', 'en'))

    expect(map.get('headquarter')).toBe('headquarters')
    expect(map.get('headquarters')).toBe('headquarters')
  })
})
