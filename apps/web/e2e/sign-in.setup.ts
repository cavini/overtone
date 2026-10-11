// Walks through the real door once, and lends the key to every other spec.
//
// Through the form, not through the endpoint. Posting to `/api/enter`
// directly would have kept passing on the day the form disappeared — which
// is precisely what happened in the app itself.
import { expect, test as setup } from '@playwright/test'
import { STATE_FILE } from './state.js'

setup('sign in', async ({ page }) => {
  const password = process.env['OVERTONE_PASSWORD']

  // Deliberately a hard failure, not a skip. A skip here is what produced
  // eight tests that looked at the sign-in page and said nothing was wrong.
  expect(
    password,
    'set OVERTONE_PASSWORD in .env.local at the repo root — without it the app has no door to walk through',
  ).toBeTruthy()

  await page.goto('/pt')
  await page.locator('input[type="password"]').fill(password ?? '')
  await page.locator('button[type="submit"]').click()

  // Proof the key turned: no door on the screen any more.
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.locator('main')).toBeVisible()

  await page.context().storageState({ path: STATE_FILE })
})
