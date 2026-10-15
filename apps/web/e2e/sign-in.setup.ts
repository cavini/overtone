// Walks through the real door once, and lends the key to every other spec.
//
// Through the form, not through the endpoint. Posting to the API directly
// would have kept passing on the day the form disappeared — which is
// precisely what happened in the app itself, twice: once with a form that
// posted nowhere, and once with a working form the page never rendered.
import { expect, test as setup } from '@playwright/test'
import { STATE_FILE } from './state.js'

setup('sign in', async ({ page }) => {
  const email = process.env['OVERTONE_ACCOUNT_EMAIL']
  const password = process.env['OVERTONE_ACCOUNT_PASSWORD']

  // Deliberately hard failures, not skips. A skip here is what produced
  // eight tests that looked at the sign-in page and said nothing was wrong.
  expect(
    email,
    'set OVERTONE_ACCOUNT_EMAIL in .env.local at the repo root — without it there is no account to sign in as',
  ).toBeTruthy()
  expect(
    password,
    'set OVERTONE_ACCOUNT_PASSWORD in .env.local at the repo root',
  ).toBeTruthy()

  await page.goto('/pt')
  await page.locator('input[type="email"]').fill(email ?? '')
  await page.locator('input[type="password"]').fill(password ?? '')
  await page.locator('button[type="submit"]').click()

  /*
   * Proof the key turned, and proof it is the right proof: the password
   * field is gone *and* the library is on screen. Waiting only for the
   * field to vanish would also be satisfied by the form being replaced by
   * an error.
   */
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.locator('main')).toBeVisible()

  await page.context().storageState({ path: STATE_FILE })
})
