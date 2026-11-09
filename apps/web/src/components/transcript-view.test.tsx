// @vitest-environment happy-dom
//
// US-002 · the rendering contract of the biggest component in the app.
//
// Written before splitting it, which is the whole point: 475 lines, twelve
// pieces of state and six effects, with no test of any kind. These pin what
// a reader can see, so moving the JSX into smaller pieces is a refactor
// rather than a rewrite nobody can check.
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UI } from '../i18n/ui.js'

const answer = vi.fn()
vi.mock('../api/call-api.js', () => ({ callApi: (...args: unknown[]) => answer(...args) }))

const { TranscriptView } = await import('./transcript-view.js')

const labels = UI.pt
const line = (startMs: number, text: string) => ({ startMs, endMs: startMs + 2_000, text })

const withLines = (...texts: string[]) => ({
  ok: true as const,
  data: {
    lines: texts.map((t, at) => line(at * 2_000, t)),
    nextFrom: texts.length * 2_000,
  },
})

beforeEach(() => {
  answer.mockReset()
  // Reduced motion, so the reveal lands in one step rather than over a
  // timer. The typing effect is a presenter concern and is tested there.
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
  })
})

describe('TranscriptView', () => {
  it('shows the heading and a way to collapse it', async () => {
    answer.mockResolvedValue(withLines('bom dia'))

    render(<TranscriptView episodeId="ep1" labels={labels} live={false} />)

    expect(screen.getByRole('heading', { name: labels.transcriptHeading })).toBeTruthy()
    // Open by default: the words are what the product is for, so they do not
    // go behind a click.
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy()
  })

  it('puts the transcribed words on the page', async () => {
    answer.mockResolvedValue(withLines('primeira linha', 'segunda linha'))

    render(<TranscriptView episodeId="ep1" labels={labels} live={false} />)

    await waitFor(() => {
      expect(screen.getByText(/primeira linha/u)).toBeTruthy()
    })
    expect(screen.getByText(/segunda linha/u)).toBeTruthy()
  })

  /*
   * The state is derived during the render rather than cleared in an effect.
   * An effect runs *after* the render that changed the episode, so for one
   * frame the previous episode's transcript sat under the new one's heading.
   */
  it('does not show one episode’s words under another’s heading', async () => {
    answer.mockResolvedValue(withLines('do primeiro episodio'))
    const view = render(<TranscriptView episodeId="ep1" labels={labels} live={false} />)

    await waitFor(() => {
      expect(screen.getByText(/do primeiro episodio/u)).toBeTruthy()
    })

    answer.mockResolvedValue({ ok: true as const, data: { lines: [], nextFrom: 0 } })
    view.rerender(<TranscriptView episodeId="ep2" labels={labels} live={false} />)

    expect(screen.queryByText(/do primeiro episodio/u)).toBeNull()
  })

  it('says it has nothing rather than showing an empty box', async () => {
    answer.mockResolvedValue({ ok: true as const, data: { lines: [], nextFrom: 0 } })

    render(<TranscriptView episodeId="ep1" labels={labels} live={false} />)

    await waitFor(() => {
      expect(screen.getByText(labels.transcriptEmpty)).toBeTruthy()
    })
  })

  /*
   * A failed look settles the state anyway, and says "nothing transcribed
   * yet". That is deliberate and the component says why: a finished episode
   * is asked once and never polled again, so waiting for a successful
   * answer would leave it spinning for good.
   *
   * Pinned as the trade-off it is rather than asserted against. The comment
   * on it already agrees with the complaint — "a fetch that failed is not a
   * transcript that is empty, and saying so needs a state and a sentence of
   * its own" — so this test is what would go red when that fourth state
   * arrives, which is the right moment to look at it again.
   */
  it('settles on "nothing yet" after a failed look, spinning being worse', async () => {
    answer.mockResolvedValue({ ok: false as const, error: 'OFFLINE' })

    render(<TranscriptView episodeId="ep1" labels={labels} live={false} />)

    await waitFor(() => {
      expect(screen.getByText(labels.transcriptEmpty)).toBeTruthy()
    })
    // And not stuck on the loading sentence, which is the failure this
    // behaviour exists to avoid.
    expect(screen.queryByText(labels.transcriptLoading)).toBeNull()
  })

  it('asks for the transcript of the episode it was given', async () => {
    answer.mockResolvedValue(withLines('oi'))

    render(<TranscriptView episodeId="ep-42" labels={labels} live={false} />)

    await waitFor(() => {
      expect(String(answer.mock.calls[0]?.[0])).toContain('ep-42')
    })
    expect(String(answer.mock.calls[0]?.[0])).toContain('/api/episodes/transcript')
  })
})
