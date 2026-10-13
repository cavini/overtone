// US-011 · drill from a count to its occurrences
//
// Search is the path that was landing every result at 00:00, because the
// chunk index was derived by division and a one-chunk episode always gave
// zero. Nothing had opened it in a browser since.
import { expect, test } from '@playwright/test'
import { fitsOnAPhone } from './fits-on-a-phone.js'

/** A word that is in the one episode the library holds. */
const PRESENT = 'coisa'

test.describe('finding a moment', () => {
  test.slow()

  /*
   * The box lives on the transcript's heading now, not in a panel of its
   * own. This used to open a collapsible named "Procurar um momento" — and
   * when that panel went away, both tests here started *skipping* rather
   * than failing, which is the quiet version of the same bug.
   */
  const open = async (page: import('@playwright/test').Page): Promise<boolean> => {
    await page.goto('/pt')
    await page.waitForLoadState('networkidle')

    return (await page.locator('input[type="search"]').count()) > 0
  }

  test('opens, takes a word, and shows where it was said', async ({ page }) => {
    test.skip(!(await open(page)), 'no search box on the page')

    const field = page.locator('input[type="search"]').first()
    await expect(field, 'no search box on the transcript heading').toBeVisible()

    await field.fill(PRESENT)
    await field.press('Enter')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2500)

    const results = page.locator('main').getByText(/\d\d:\d\d/u)
    expect(await results.count(), `nothing found for "${PRESENT}"`).toBeGreaterThan(0)

    /*
     * The bug this path shipped with: every result pointed at 00:00,
     * because the chunk index came from dividing by a chunk length and a
     * one-chunk episode always divides to zero. One result at 00:00 is
     * ordinary; every result at 00:00 is that bug back.
     */
    const stamps = await results.allTextContents()
    const moments = stamps.flatMap((text) => [...text.matchAll(/\d\d:\d\d/gu)].map((m) => m[0]))
    expect(new Set(moments).size, `every result pointed at the same moment: ${moments.join(' ')}`)
      .toBeGreaterThan(1)

    await fitsOnAPhone(page, 'search results')
  })

  test('says so plainly when a word is not in the episode', async ({ page }) => {
    test.skip(!(await open(page)), 'no search box on the page')

    const field = page.locator('input[type="search"]').first()
    await field.fill('zzqqxx-not-a-word')
    await field.press('Enter')
    await page.waitForTimeout(2000)

    const said = ((await page.locator('main').textContent()) ?? '').toLowerCase()
    expect(said, 'an empty result said nothing at all').toMatch(/nada|nenhum|não|no results|nothing/u)
  })
})
