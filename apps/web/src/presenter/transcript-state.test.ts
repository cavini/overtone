// US-010 · what the transcript area is allowed to say
//
// "Nada transcrito ainda." was shown whenever there were no lines in hand,
// and that included the gap between clicking an episode in the library and
// its words arriving. For a second — longer on a bad connection — the app
// stated, with no hedging, that an episode holding two hours of transcript
// had none of it.
//
// Not fetched yet and fetched with nothing in it are different answers, and
// only the second one is that sentence.
import { describe, expect, it } from 'vitest'
import { transcriptState } from './transcript-state.js'

const EPISODE = 'ep-1'

describe('transcriptState', () => {
  it('is loading until an answer has come back', () => {
    expect(
      transcriptState({
        asked: { episodeId: EPISODE, read: 0 },
        inHand: undefined,
        chars: 0,
      }),
    ).toBe('loading')
  })

  it('is empty once the answer came back with nothing in it', () => {
    expect(
      transcriptState({
        asked: { episodeId: EPISODE, read: 0 },
        inHand: { episodeId: EPISODE, read: 0 },
        chars: 0,
      }),
    ).toBe('empty')
  })

  it('shows the words once there are some', () => {
    expect(
      transcriptState({
        asked: { episodeId: EPISODE, read: 0 },
        inHand: { episodeId: EPISODE, read: 0 },
        chars: 412,
      }),
    ).toBe('lines')
  })

  /*
   * Switching episodes is the case that made this a function.
   *
   * The lines in hand are the previous episode's, so neither of the other
   * two answers is available: they are not this episode's transcript, and
   * their absence is not this episode's emptiness either.
   */
  it('goes back to loading when the episode changes under the lines in hand', () => {
    expect(
      transcriptState({
        asked: { episodeId: 'ep-2', read: 0 },
        inHand: { episodeId: EPISODE, read: 0 },
        chars: 11_000,
      }),
    ).toBe('loading')
  })

  it('does not flash the empty message between two episodes', () => {
    expect(
      transcriptState({
        asked: { episodeId: 'ep-2', read: 0 },
        inHand: { episodeId: EPISODE, read: 0 },
        chars: 0,
      }),
    ).toBe('loading')
  })

  /*
   * A correction re-derives the whole episode (US-049), so the lines in hand
   * describe an analysis that no longer exists. Same episode, different read
   * of it — and the same reason not to call it empty while it reloads.
   */
  it('goes back to loading while a corrected episode is read again', () => {
    expect(
      transcriptState({
        asked: { episodeId: EPISODE, read: 1 },
        inHand: { episodeId: EPISODE, read: 0 },
        chars: 11_000,
      }),
    ).toBe('loading')
  })

  /*
   * A chunk of music or silence transcribes to lines with no words in them.
   * Counted in characters rather than lines, so that is empty — which it is.
   */
  it('is empty when what came back has no words in it', () => {
    expect(
      transcriptState({
        asked: { episodeId: EPISODE, read: 3 },
        inHand: { episodeId: EPISODE, read: 3 },
        chars: 0,
      }),
    ).toBe('empty')
  })
})
