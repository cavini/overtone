// US-038 · what a library row is allowed to say about an episode
//
// A failed episode rendered exactly like one still being transcribed. The
// row's only input was `chunksDone < chunkCount`, and the client's own
// `LibraryEntry` dropped the `status` that `/api/episodes/list` had already
// sent it — so the component could not tell the two apart even in
// principle.
//
// Episode 41 sat at 1/9 behind a spinner for two days having given up on
// the first, with all eight remaining chunks still in the bucket and
// nothing left that would ever pick it up again. A spinner is a promise
// that something is happening.
import { describe, expect, it } from 'vitest'
import { libraryRowState } from './library-row-state.js'

describe('libraryRowState', () => {
  it('shows progress while the episode is still in flight', () => {
    expect(libraryRowState('uploaded')).toBe('progress')
    expect(libraryRowState('transcribing')).toBe('progress')
    expect(libraryRowState('analyzing')).toBe('progress')
  })

  it('says it failed rather than spinning', () => {
    expect(libraryRowState('failed')).toBe('failed')
  })

  it('says nothing about an episode that is only there to be read', () => {
    expect(libraryRowState('ready')).toBe('nothing')
  })

  /*
   * A row on its way out is not a row making progress. It had a spinner
   * before this, because a half-transcribed episode being deleted still
   * answered `chunksDone < chunkCount`.
   */
  it('says nothing about an episode being deleted', () => {
    expect(libraryRowState('deleting')).toBe('nothing')
  })

  /*
   * The status arrives as JSON, so it is a string and not an `EpisodeStatus`
   * however it is typed. Anything unrecognised must not spin: a spinner is
   * the one answer that cannot be withdrawn without someone watching.
   */
  it('says nothing about a status it does not recognise', () => {
    expect(libraryRowState('')).toBe('nothing')
    expect(libraryRowState('something-new')).toBe('nothing')
  })
})
