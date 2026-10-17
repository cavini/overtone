// US-011 · drill from a count to its occurrences
//
// Search is the path that was landing every result at 00:00, because the chunk
// index was derived by division and a one-chunk episode always gave zero.
//
// **This file then spent weeks testing nothing.** It picked its field with
// `input[type="search"]`, and the only input with that type is the library
// filter — the search panel's field has an `aria-label` and no type at all. So
// it typed into the filter, then asserted on `main` containing timestamps,
// which the transcript underneath supplies by the hundred. Both tests passed
// and neither searched.
//
// Hence: the field is found by its label, and every assertion is scoped to the
// search panel, so nothing the transcript renders can satisfy one.
import { expect, test } from '@playwright/test'
import { fitsOnAPhone } from './fits-on-a-phone.js'

/** A word the library really holds, in several episodes. */
const PRESENT = 'coisa'

test.describe('finding a moment', () => {
  test.slow()

  /** The search panel, opened, with its own field — never the library filter. */
  const searchIn = async (page: import('@playwright/test').Page) => {
    await page.goto('/pt')
    await page.waitForLoadState('networkidle')

    const opener = page.getByRole('button', { name: /procurar um momento/iu })
    if ((await opener.count()) === 0) return undefined
    if ((await opener.getAttribute('aria-expanded')) === 'false') await opener.click()

    /*
     * By label. The library filter is the one with `type="search"`, so any
     * selector reaching for that gets the wrong box — which is the mistake
     * this file shipped with.
     */
    const field = page.getByLabel('Procurar um momento', { exact: true })
    await expect(field, 'the search panel has no field in it').toBeVisible()

    // The panel itself, so a result has to be inside it to count.
    const panel = page.locator('section, div').filter({ has: field }).last()

    return { field, panel }
  }

  const ask = async (
    subject: { field: import('@playwright/test').Locator },
    word: string,
  ): Promise<void> => {
    await subject.field.fill(word)
    await subject.field.press('Enter')
    await page$wait()
  }

  // Search is a round trip and the panel renders when it lands.
  const page$wait = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }

  test('opens, takes a word, and shows where it was said', async ({ page }) => {
    const subject = await searchIn(page)
    test.skip(subject === undefined, 'no search panel on the page')
    if (subject === undefined) return

    await ask(subject, PRESENT)

    /*
     * Timestamps inside the panel. Read off `main` this is satisfied by the
     * transcript, which is how this test used to pass without searching.
     */
    const inside = (await subject.panel.textContent()) ?? ''
    const moments = [...inside.matchAll(/\d?\d:\d\d/gu)].map((match) => match[0])
    expect(moments.length, `nothing found for "${PRESENT}" in the search panel`).toBeGreaterThan(0)

    /*
     * The bug this path shipped with: every result pointed at 00:00, because
     * the chunk index came from dividing by a chunk length and a one-chunk
     * episode always divides to zero. One result at 00:00 is ordinary; every
     * result at 00:00 is that bug back.
     */
    expect(
      new Set(moments).size,
      `every result pointed at the same moment: ${moments.join(' ')}`,
    ).toBeGreaterThan(1)

    await fitsOnAPhone(page, 'search results')
  })

  test('says so plainly when a word is not in the library', async ({ page }) => {
    const subject = await searchIn(page)
    test.skip(subject === undefined, 'no search panel on the page')
    if (subject === undefined) return

    await ask(subject, 'zzqqxx-not-a-word')

    // In the panel. On `main`, the library filter's own empty message counts
    // — which is the other half of how this file used to pass.
    await expect(subject.panel).toContainText(/nada encontrado/iu)
  })

  /*
   * A search that shows part of the answer has to say which part.
   *
   * The budget samples across every episode, so a word said thousands of
   * times comes back as a few hundred moments. Without the count, nothing
   * tells that apart from "this is all there is".
   *
   * In a browser because the line is conditional, and conditional rendering
   * has bitten this app twice: a sign-in form the page never drew, and a word
   * table nothing fetched for.
   */
  test('says how many matches there are, and whether that is all of them', async ({ page }) => {
    const subject = await searchIn(page)
    test.skip(subject === undefined, 'no search panel on the page')
    if (subject === undefined) return

    await ask(subject, PRESENT)

    const inside = (await subject.panel.textContent()) ?? ''
    expect(inside, 'it did not say whether the list is everything').toMatch(
      /trechos no total|trechos, todos na lista/u,
    )

    /*
     * And the figure reads as a number. `count(*)` is a bigint and a bigint
     * arrives as a string, so summing the per-episode totals once
     * concatenated them — the page showed "015518018815314918817022…" and it
     * looked like a very large number rather than a bug.
     */
    const figure = /([\d.]{1,12}) trechos/u.exec(inside)
    expect(figure, 'no readable count in the sentence').not.toBeNull()
    const digits = (figure?.[1] ?? '').replace(/\./gu, '')
    expect(digits.length, `the count read as a run of digits: ${digits}`).toBeLessThan(8)
  })
})
