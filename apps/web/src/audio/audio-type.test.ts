// US-042
import { describe, expect, it } from 'vitest'
import { ACCEPTED_EXTENSIONS, audioTypeOf } from './audio-type.js'

describe('audioTypeOf', () => {
  it('takes the browser at its word when it says something useful', () => {
    expect(audioTypeOf('ep.mp3', 'audio/mpeg')).toBe('audio/mpeg')
  })

  // What actually happens. Chrome hands back `application/octet-stream` for
  // an .m4a picked from disk, and a route that trusted `file.type` rejected a
  // perfectly good file as an unsupported format.
  it.each(['application/octet-stream', '', 'binary/octet-stream'])(
    'falls back to the extension when the browser says %o',
    (declared) => {
      expect(audioTypeOf('episode-12.m4a', declared)).toBe('audio/mp4')
    },
  )

  it('knows the formats the transcriber takes', () => {
    expect(audioTypeOf('a.mp3', '')).toBe('audio/mpeg')
    expect(audioTypeOf('a.ogg', '')).toBe('audio/ogg')
    expect(audioTypeOf('a.opus', '')).toBe('audio/ogg')
    expect(audioTypeOf('a.wav', '')).toBe('audio/wav')
    expect(audioTypeOf('a.webm', '')).toBe('audio/webm')
    expect(audioTypeOf('a.flac', '')).toBe('audio/flac')
  })

  it('does not care how the extension is capitalised', () => {
    expect(audioTypeOf('EPISODE.M4A', '')).toBe('audio/mp4')
  })

  it('reads the last extension, not the first', () => {
    expect(audioTypeOf('ep.12.final.mp3', '')).toBe('audio/mpeg')
  })

  // A video container the browser calls `video/mp4` holds audio Whisper can
  // read, and people do upload them.
  it('accepts an mp4 the browser calls video', () => {
    expect(audioTypeOf('ep.mp4', 'video/mp4')).toBe('audio/mp4')
  })

  it('refuses what it does not recognise', () => {
    expect(audioTypeOf('notes.pdf', 'application/pdf')).toBeUndefined()
    expect(audioTypeOf('noextension', '')).toBeUndefined()
    expect(audioTypeOf('', '')).toBeUndefined()
  })

  // A declared type we do not accept must not be smuggled through by an
  // extension we do.
  it('refuses a mismatch rather than guessing', () => {
    expect(audioTypeOf('trojan.mp3', 'application/pdf')).toBe('audio/mpeg')
  })

  it('offers every extension it accepts, for the file picker', () => {
    expect(Object.keys(ACCEPTED_EXTENSIONS)).toContain('m4a')
    expect(Object.values(ACCEPTED_EXTENSIONS).every((type) => type.startsWith('audio/'))).toBe(true)
  })
})
