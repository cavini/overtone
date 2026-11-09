// @vitest-environment happy-dom
//
// The smallest component in the app, used to prove the DOM setup before
// anything is written against a 475-line one. It corrected two guesses on
// the first run, which is the point of having it.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Spinner } from './spinner.js'

describe('Spinner', () => {
  /*
   * It announces itself, deliberately. The library row used to say "Lendo"
   * on the open episode and "Ler" on the others, which read as *the app is
   * reading it* on an episode that finished hours ago. The label is how the
   * meaning survives without a word on screen.
   */
  it('announces what is happening, with the caller’s words', () => {
    render(<Spinner label="Transcrevendo" />)

    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Transcrevendo')
  })

  // The ring is the message; the spin is only how it is usually delivered.
  it('keeps the ring when motion is turned down', () => {
    render(<Spinner label="Transcrevendo" />)

    const spinner = screen.getByRole('status')
    const classes = spinner.getAttribute('class') ?? ''
    expect(classes).toContain('motion-reduce:animate-none')
    expect(classes).toContain('rounded-full')
  })
})
