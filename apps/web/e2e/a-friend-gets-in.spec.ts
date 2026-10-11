// M4 exit (4) · a friend who has never seen the app signs in with no help
//
// This is the test that should have existed before PR #28, which replaced
// the shared-password form with the magic-link one and kept `/api/enter`
// behind it. The endpoint still worked; nothing in the app could reach it.
// The only door left needed an email provider that was never configured, so
// a friend on a fresh phone had no way in at all — and it stayed invisible
// because the builder's own month-long cookie kept letting *them* in.
import { expect, test } from '@playwright/test'
import { fitsOnAPhone } from './fits-on-a-phone.js'

// A friend has never been here. No cookie, no storage, nothing.
test.use({ storageState: { cookies: [], origins: [] } })

const PASSWORD = process.env['OVERTONE_PASSWORD'] ?? ''

test.describe('somebody arriving for the first time', () => {
  test.skip(PASSWORD.length === 0, 'needs OVERTONE_PASSWORD, the same as production has')

  for (const locale of ['pt', 'en'] as const) {
    test(`can get in by typing the password, in ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}`)

      const field = page.locator('input[type="password"]')
      await expect(field, 'there is nowhere to type the password').toBeVisible()

      await fitsOnAPhone(page, `the ${locale} door`)

      await field.fill(PASSWORD)
      await page.locator('button[type="submit"], input[type="submit"]').first().click()

      // In, and looking at their own library rather than the door again.
      await expect(page.locator('input[type="password"]')).toHaveCount(0)
      await expect(page.locator('main')).toBeVisible()
    })
  }

  test('is told when the password is wrong, rather than just bouncing', async ({ page }) => {
    await page.goto('/pt')
    await page.locator('input[type="password"]').fill('not the password')
    await page.locator('button[type="submit"], input[type="submit"]').first().click()

    await expect(page.locator('input[type="password"]'), 'it let a wrong password in').toBeVisible()

    const said = ((await page.locator('main').textContent()) ?? '').toLowerCase()
    expect(said, 'it bounced them back with no explanation').toMatch(/senha|password|confere|again/u)
  })
})
