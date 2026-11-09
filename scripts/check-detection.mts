/**
 * Does the language detection actually work, on real audio.
 *
 * The manual check the suite cannot do: no test may call Groq, so that the
 * endpoint detects at all when `language` is omitted — and that its
 * `"portuguese"` maps to `pt` — is otherwise taken from the API contract
 * rather than observed.
 *
 * Writes no episode, no transcript and no counts. The only thing that
 * touches the project is three transient probe WAVs in storage, deleted
 * before this exits. Cost is 90 audio-seconds per file.
 *
 * Prints the detected language and nothing of what was said.
 */
import {
  languageFromStopWords,
  planLanguageProbes,
  settleLanguage,
  type AudioLanguage,
} from '../packages/core/src/index.js'
import { GroqTranscriptionProvider } from '../packages/adapters/src/groq/index.js'
import { SupabaseBlobStore } from '../packages/adapters/src/supabase/index.js'
import { encodeWav, SAMPLE_RATE } from '../apps/web/src/audio/wav.js'
import { decodeWithFfmpeg } from '../tools/backfill/src/decode-with-ffmpeg.js'
import { spawnProgram } from '../tools/backfill/src/spawn-program.js'

const need = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new Error(`${name} is not set`)
  return value
}

const blobs = new SupabaseBlobStore({
  projectUrl: need('NEXT_PUBLIC_SUPABASE_URL'),
  secretKey: need('SUPABASE_SECRET_KEY'),
  bucket: process.env['SUPABASE_AUDIO_BUCKET'] ?? 'episode-audio',
})

const groq = new GroqTranscriptionProvider({ apiKey: need('GROQ_API_KEY') })
const TTL = 15 * 60

async function check(label: string, path: string, expected: AudioLanguage): Promise<boolean> {
  const samples = await decodeWithFfmpeg(path, spawnProgram)
  const durationMs = (samples.length / SAMPLE_RATE) * 1000
  const planned = planLanguageProbes(durationMs)

  console.log(`\n${label}`)
  console.log(`  ${(durationMs / 1000).toFixed(0)}s of audio · ${planned.length} probes at ` +
    planned.map((p) => `${(p.startMs / 1000).toFixed(0)}s`).join(', '))

  const keys: string[] = []
  const heard: Array<AudioLanguage | undefined> = []

  try {
    // One at a time. The allowance is spent in seconds of audio and refills
    // at two a wall-second, so concurrency buys nothing.
    for (const [index, probe] of planned.entries()) {
      const key = `probe-check/${label}-${index}.wav`
      keys.push(key)

      const from = Math.floor((probe.startMs / 1000) * SAMPLE_RATE)
      const to = Math.floor((probe.endMs / 1000) * SAMPLE_RATE)
      const wav = encodeWav(samples.subarray(from, to))

      const put = await fetch(await blobs.uploadUrl(key, TTL), {
        method: 'PUT',
        headers: { 'content-type': 'audio/wav' },
        body: new Blob([wav], { type: 'audio/wav' }),
      })
      if (!put.ok) throw new Error(`probe ${index} upload failed: ${put.status}`)

      // No `language`. This is the request that asks.
      const outcome = await groq.transcribe({ audioUrl: await blobs.readUrl(key, TTL) })

      if (!outcome.ok) {
        console.log(`  probe ${index}  REFUSED  ${JSON.stringify(outcome.failure)}`)
        heard.push(undefined)
        continue
      }

      // The transcript text is deliberately not printed. The language is
      // the whole data point.
      const words = outcome.transcript.words.length
      const evidence = languageFromStopWords(outcome.transcript.text)
      console.log(
        `  probe ${index}  heard ${outcome.transcript.language}` +
        `  · ${words} words · stop-words say ${evidence.language ?? 'nothing'}` +
        ` (pt ${evidence.pt} / en ${evidence.en})`,
      )
      heard.push(outcome.transcript.language)
    }
  } finally {
    await blobs.remove(keys).catch(() => {})
  }

  const settled = settleLanguage(heard)
  const passed = settled === expected
  console.log(`  => settled ${settled ?? 'undecided'} · expected ${expected} · ${passed ? 'PASS' : 'FAIL'}`)
  return passed
}

const home = '/Users/arthurcavini'
const cases: Array<[string, string, AudioLanguage]> = [
  // The one that tests the design: English up front, Portuguese after.
  ['intro-trap', `${home}/Desktop/Development/overtone/audio/fixtures/intro-trap-pt-with-english-intro.m4a`, 'pt'],
  // Real English speech, which the English pack has never seen.
  ['real-english', `${home}/Desktop/JRE_language_test/JRE2574_part_08.mp3`, 'en'],
]

let allPassed = true
for (const [label, path, expected] of cases) {
  allPassed = (await check(label, path, expected)) && allPassed
}

console.log(`\n${allPassed ? 'ALL PASSED' : 'SOMETHING FAILED'}`)
