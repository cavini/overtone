// US-003
import { describe, expect, it } from 'vitest'
import { FakeTranscriptionProvider, transcriptFromText } from './fake-transcription-provider.js'
import { describeTranscriptionProvider } from './transcription-provider.contract.js'

const EPISODE = 'E aí galera, hoje a gente vai falar do pirão do churrasco'

describeTranscriptionProvider('FakeTranscriptionProvider', () => ({
  provider: FakeTranscriptionProvider.withText('audio://episode-12', EPISODE),
  knownAudioUrl: 'audio://episode-12',
  missingAudioUrl: 'audio://nothing-here',
}))

describe('transcriptFromText', () => {
  it('gives every word a slot of its own', () => {
    const { words } = transcriptFromText('um dois três')
    expect(words).toEqual([
      { text: 'um', startMs: 0, endMs: 400 },
      { text: 'dois', startMs: 400, endMs: 800 },
      { text: 'três', startMs: 800, endMs: 1200 },
    ])
  })

  it('honours an offset and a cadence', () => {
    const { words, durationMs } = transcriptFromText('um dois', {
      startMs: 5_000,
      msPerWord: 250,
    })
    expect(words[0]?.startMs).toBe(5_000)
    expect(words[1]?.startMs).toBe(5_250)
    expect(durationMs).toBe(5_500)
  })

  it('keeps accents intact so the analysis sees real Portuguese', () => {
    expect(transcriptFromText('você está aí').words.map((w) => w.text)).toEqual([
      'você', 'está', 'aí',
    ])
  })

  it('copes with an empty transcript', () => {
    const transcript = transcriptFromText('')
    expect(transcript.words).toEqual([])
    expect(transcript.text).toBe('')
    expect(transcript.durationMs).toBe(0)
  })
})

describe('FakeTranscriptionProvider', () => {
  it('serves different audio for different urls', async () => {
    const provider = new FakeTranscriptionProvider()
      .set('audio://a', transcriptFromText('primeiro episódio'))
      .set('audio://b', transcriptFromText('segundo episódio'))

    const first = await provider.transcribe({ audioUrl: 'audio://a', language: 'pt' })
    const second = await provider.transcribe({ audioUrl: 'audio://b', language: 'pt' })

    if (!first.ok || !second.ok) throw new Error('expected transcripts')
    expect(first.transcript.text).toBe('primeiro episódio')
    expect(second.transcript.text).toBe('segundo episódio')
  })

  it('returns the same transcript every time, so tests cannot flake', async () => {
    const provider = FakeTranscriptionProvider.withText('audio://x', EPISODE)
    const once = await provider.transcribe({ audioUrl: 'audio://x', language: 'pt' })
    const twice = await provider.transcribe({ audioUrl: 'audio://x', language: 'pt' })
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })
})
