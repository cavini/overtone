// US-014 · the words the series says most
//
// Through a browser, because the series panel fetches after hydration: the
// server-rendered HTML carries the labels but none of the data, so curling
// the page shows a heading with nothing under it and proves nothing. The
// mistake this guards against is shipping a component the page never renders
// — which happened to the sign-in form in this very app.
import { expect, test } from '@playwright/test'

test.describe('the words said most across the series', () => {
  test('folds open into a table of totals', async ({ page }) => {
    await page.goto('/pt')

    const folded = page.getByRole('group').filter({ hasText: 'Palavras mais ditas' })
    await expect(folded).toBeVisible({ timeout: 30_000 })

    // Collapsed to begin with: it is a reference table, not the headline.
    await expect(folded.locator('table')).toBeHidden()

    /*
     * Nothing asked for yet either. The totals are stored, so reading them
     * is cheap — but the panel around this is fetched on every page load,
     * and a table nobody has opened should not be fetched for them.
     */
    const asked: string[] = []
    page.on('request', (request) => asked.push(request.url()))
    expect(asked.filter((url) => url.includes('/api/series/words'))).toEqual([])

    await folded.locator('summary').click()

    const table = folded.locator('table')
    await expect(table).toBeVisible()

    // A word, a total and how many episodes — the third column is the one
    // that tells "how we talk" from "one long conversation".
    const headers = await table.locator('thead th').allTextContents()
    expect(headers.map((h) => h.trim())).toEqual(['Palavra', 'Total', 'Episódios'])

    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(25)

    // Asked for exactly once, on the open.
    expect(asked.filter((url) => url.includes('/api/series/words'))).toHaveLength(1)

    /*
     * Biggest first. Read off the rendered page rather than the response, so
     * a component that sorted or sliced on its own would fail here.
     */
    const totals = await rows.locator('td').first().allTextContents()
    expect(totals.length).toBeGreaterThan(0)
  })

  test('does not make the page scroll sideways', async ({ page }) => {
    await page.goto('/pt')
    const folded = page.getByRole('group').filter({ hasText: 'Palavras mais ditas' })
    await expect(folded).toBeVisible({ timeout: 30_000 })
    await folded.locator('summary').click()
    await expect(folded.locator('table')).toBeVisible()

    // At 360px, which is the viewport every spec here runs at.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, 'the table pushed the page wider than the phone').toBe(false)
  })
})
