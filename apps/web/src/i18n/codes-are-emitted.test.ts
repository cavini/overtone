// ADR 0017
//
// Which message codes the app can actually produce.
//
// ADR 0028 made the point about one of these already: there was a
// `LINK_ALREADY_USED`, nothing could ever produce it, and "a code nothing
// emits is a case nothing tests". Then the catalogue grew to 51 codes of which
// **24 were emitted by nothing** — half of it wording for features that were
// designed and not built, or built differently, or dropped. Both catalogues
// carried translations for all of them and the count assertion next door made
// the total look deliberate.
//
// So the unbuilt ones are listed here by name instead of hiding in the count.
// Wire one up and this test tells you to take it off the list; add a code
// without wiring it up and it tells you to put it on. Either way the catalogue
// stops quietly drifting away from the app.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MESSAGE_CODES } from '@overtone/messages'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

/** Every TypeScript source in the repo, minus what is generated or vendored. */
function sourcesUnder(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'coverage' || entry === '.next') continue

    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      sourcesUnder(path, found)
      continue
    }
    if (/\.tsx?$/u.test(entry)) found.push(path)
  }

  return found
}

/*
 * Production source only. A code mentioned solely by a test is no better off
 * than one mentioned nowhere — it proves the catalogue has an entry, not that
 * anything can reach it.
 */
const production = sourcesUnder(resolve(repoRoot, 'packages'))
  .concat(sourcesUnder(resolve(repoRoot, 'apps')))
  .concat(sourcesUnder(resolve(repoRoot, 'tools')))
  .filter((path) => !/\.test\.tsx?$/u.test(path))
  .filter((path) => !path.includes(`${'/'}testing${'/'}`))
  .filter((path) => !path.endsWith('codes.ts'))
  .filter((path) => !path.endsWith('codes-are-emitted.test.ts'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

/**
 * Codes the app cannot currently produce, and why.
 *
 * Each is wording designed ahead of the feature it belongs to. Keeping them is
 * deliberate — the phrasing is the work, and `docs/product/backlog.md` still
 * calls for most of these — but keeping them *silently* is what let the
 * catalogue drift to half fiction.
 */
const NOT_YET_EMITTED = new Map<string, string>([
  // Transcription quality, none of it built: nothing inspects a transcript
  // and nothing times a chunk out.
  ['CHUNK_TIMEOUT', 'no timeout is enforced; a chunk fails or it does not'],
  ['NO_SPEECH_DETECTED', 'a silent chunk is counted as done, not reported'],
  ['TRANSCRIPT_QUALITY_POOR', 'nothing scores a transcript'],
  ['AUDIO_MAY_NOT_BE_PTBR', 'the language is chosen per episode, never guessed'],

  // Allowance and storage, surfaced as plain progress instead.
  ['ALLOWANCE_REMAINING', 'the wait is shown as a countdown, not a balance'],
  ['UPLOAD_COST_PREVIEW', 'nothing previews what an upload will spend'],
  ['STORAGE_FULL', 'audio is freed per chunk, so the bucket never fills (ADR 0031)'],
  ['AUDIO_IS_SAFE', 'no retention promise is shown; audio is simply not kept'],

  // Running jokes beyond the basics.
  ['ALIAS_SUGGESTED_WRITTEN_VARIANT', 'nothing suggests spellings yet'],
  ['TOPIC_APPLY_SKIPPED_NO_TRANSCRIPT', 'a recount reads stored chunks, which are always there'],
  ['TOPIC_NO_EPISODES_YET', 'the empty state is chrome, not a code'],
  ['NO_TOPICS_YET', 'the empty state is chrome, not a code'],

  // Library and series empty states, all drawn from `i18n/ui.ts` instead,
  // because they are page furniture rather than something that happened.
  ['LIBRARY_EMPTY', 'drawn as chrome (libraryEmpty)'],
  ['EPISODES_STILL_PROCESSING', 'the count is shown, not a sentence'],
  ['SERIES_FIRST_EPISODE', 'drawn as chrome (seriesFirstEpisode)'],
  ['SERIES_NEEDS_SECOND_EPISODE', 'drawn as chrome'],
  ['TREND_NEEDS_MORE_EPISODES', "a trend of 'unknown' says this without a sentence"],

  // Statuses the reader is never shown: the presenter maps pipeline outcomes
  // (transcribing, ready, failed), not the six database statuses.
  ['STATUS_UPLOADED', 'not an outcome the presenter reports'],
  ['STATUS_ANALYZING', 'not an outcome the presenter reports'],
  ['STATUS_DELETING', 'not an outcome the presenter reports'],

  // Upload refusals the browser prevents before a request happens.
  ['UNSUPPORTED_FORMAT', 'the file picker accepts audio only, and decoding refuses the rest'],
  ['EPISODE_NUMBER_TAKEN', 'a duplicate upload is caught by its audio hash first'],
])

const emits = (code: string): boolean =>
  new RegExp(`\\b${code}\\b`, 'u').test(production)

describe('every message code', () => {
  it('is either emitted by the app or listed as not yet built', () => {
    const silent = MESSAGE_CODES.filter((code) => !emits(code))

    expect([...silent].sort()).toEqual([...NOT_YET_EMITTED.keys()].sort())
  })

  /*
   * The other direction. A code that starts being emitted has to come off the
   * list, or the list goes back to being decoration.
   */
  it('is off the not-yet-built list once something emits it', () => {
    const wired = [...NOT_YET_EMITTED.keys()].filter((code) => emits(code))

    expect(wired, 'these are emitted now and can leave NOT_YET_EMITTED').toEqual([])
  })

  it('has a reason for every code that cannot be reached', () => {
    for (const [code, reason] of NOT_YET_EMITTED) {
      expect(reason.length, `${code} needs a reason`).toBeGreaterThan(10)
    }
  })

  // Proof the scan works at all. Without this the whole file passes happily
  // if the glob silently reads nothing.
  it('can see the codes that are emitted', () => {
    expect(production.length, 'read no source at all').toBeGreaterThan(100_000)
    expect(emits('NOT_SIGNED_IN'), 'a code known to be emitted read as silent').toBe(true)
  })
})
