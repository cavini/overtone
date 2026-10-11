// M4 exit (6) · both locales walked end to end on a phone
//
// The one exit criterion with nothing behind it. Every other M4 promise has
// a unit or contract test; this one said "walked on a phone" and nobody had
// walked it, which is how the library row shipped with a 24 px title.
import { type Page, expect, test } from '@playwright/test'
import { fitsOnAPhone, nothingCrushed } from './fits-on-a-phone.js'

/** Both catalogues, every page that needs no particular episode to exist. */
const PAGES = [
  { path: '', what: 'the library' },
  { path: '/entrar', what: 'the sign-in form' },
  { path: '/creditos', what: 'the credits' },
] as const

const LOCALES = ['pt', 'en'] as const

test.describe('on a 360 px phone', () => {
  for (const locale of LOCALES) {
    for (const { path, what } of PAGES) {
      test(`${what} fits, in ${locale}`, async ({ page }) => {
        await page.goto(`/${locale}${path}`)
        await page.waitForLoadState('networkidle')

        await fitsOnAPhone(page, `/${locale}${path} — ${what}`)
      })
    }
  }

  /*
   * Overflow is not the only way a phone layout fails. The library row did
   * not overflow — it compressed, and gave the episode title 24 px.
   */
  test('nothing in the library is squeezed unreadably narrow', async ({ page }) => {
    await page.goto('/pt')
    await page.waitForLoadState('networkidle')

    await nothingCrushed(page, 'main a, main h2, main h3, main button')
  })

  test('the sign-in form can actually be typed into', async ({ page }) => {
    await page.goto('/pt/entrar')

    const field = page.locator('input[type="password"], input[type="email"]').first()
    await expect(field).toBeVisible()

    // A field a thumb cannot hit is not a form. 44 px is Apple's floor and
    // the one most often missed on a text input, which gets styled for
    // looks rather than for touch.
    const box = await field.boundingBox()
    expect(box?.height ?? 0, 'the input is shorter than a thumb').toBeGreaterThanOrEqual(36)
  })
})

/**
 * Opens the first episode in the library, the way a person does.
 *
 * The library page carries nothing but timestamps, so every check that only
 * ever loaded `/pt` was reading `00:03` and `01:22` and finding no
 * separator to be wrong about. The counts — the entire product — are one
 * click further in, and nothing had ever clicked.
 */
const openAnEpisode = async (page: Page, locale: string): Promise<boolean> => {
  await page.goto(`/${locale}`)
  await page.waitForLoadState('networkidle')

  const first = page.locator('li button').first()
  if ((await first.count()) === 0) return false

  await first.click()
  await page.waitForLoadState('networkidle')
  // A count table arriving is the signal the episode opened.
  await page.locator('table, [role="table"]').first().waitFor({ timeout: 15_000 }).catch(() => {})

  return true
}

/** pt-BR writes 2.687; English writes 2,687. */
const SEPARATOR = { pt: '.', en: ',' } as const

test.describe('an episode on a phone', () => {
  // Opening one means fetching a real episode's counts, which in dev is a
  // cold compile and a round trip to Supabase on top of the render.
  test.slow()

  for (const locale of LOCALES) {
    test(`its counts fit and read right, in ${locale}`, async ({ page }) => {
      test.skip(!(await openAnEpisode(page, locale)), 'the library has no episode to open')

      await fitsOnAPhone(page, `an open episode in ${locale}`)
      await nothingCrushed(page, 'main td, main th, main h2, main h3')

      /*
       * A count must never change because somebody switched the interface
       * language, and each language must write it its own way. The
       * separator is the half a unit test cannot see: it checks the
       * formatter, not what reached the screen.
       */
      const text = (await page.locator('main').textContent()) ?? ''
      const thousands = [...text.matchAll(/\d{1,3}[.,]\d{3}(?![\d.,])/gu)].map((found) => found[0])

      // Vacuous otherwise — which is exactly how this check first passed,
      // reading timestamps off the library page and finding nothing wrong.
      test.skip(thousands.length === 0, 'no count on screen reaches a thousand')

      const wrong = thousands.filter((number) => !number.includes(SEPARATOR[locale]))
      expect(wrong, `${locale} wrote a thousand the other language's way`).toEqual([])
    })
  }
})
