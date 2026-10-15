// M4 exit (4) · a friend who has never seen the app signs in with no help
//
// This is the test that should have existed before PR #28, which replaced the
// shared-password form with the magic-link one and kept `/api/enter` behind
// it. The endpoint still worked; nothing in the app could reach it. The only
// door left needed an email provider that was never configured, so a friend
// on a fresh phone had no way in at all.
//
// It happened again in the other direction: an email-and-password form
// shipped that the sign-in page never rendered, because the page drew one
// door and the shared password won whenever it was set. Both times it stayed
// invisible because the builder's own month-long cookie kept letting *them*
// in. Hence a spec that arrives with nothing.
import { expect, test } from '@playwright/test'
import { fitsOnAPhone } from './fits-on-a-phone.js'

// A friend has never been here. No cookie, no storage, nothing.
test.use({ storageState: { cookies: [], origins: [] } })

const EMAIL = process.env['OVERTONE_ACCOUNT_EMAIL'] ?? ''
const PASSWORD = process.env['OVERTONE_ACCOUNT_PASSWORD'] ?? ''

test.describe('somebody arriving for the first time', () => {
  test.skip(
    EMAIL.length === 0 || PASSWORD.length === 0,
    'needs OVERTONE_ACCOUNT_EMAIL and OVERTONE_ACCOUNT_PASSWORD in .env.local',
  )

  for (const locale of ['pt', 'en'] as const) {
    test(`can get in with an email and a password, in ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}`)

      const address = page.locator('input[type="email"]')
      const secret = page.locator('input[type="password"]')
      await expect(address, 'there is nowhere to type the address').toBeVisible()
      await expect(secret, 'there is nowhere to type the password').toBeVisible()

      await fitsOnAPhone(page, `the ${locale} door`)

      await address.fill(EMAIL)
      await secret.fill(PASSWORD)
      await page.locator('button[type="submit"]').first().click()

      // In, and looking at their own library rather than the door again.
      await expect(page.locator('input[type="password"]')).toHaveCount(0)
      await expect(page.locator('main')).toBeVisible()
    })
  }

  test('is told when the password is wrong, rather than just bouncing', async ({ page }) => {
    await page.goto('/pt')
    await page.locator('input[type="email"]').fill(EMAIL)
    await page.locator('input[type="password"]').fill('nao e essa a senha')
    await page.locator('button[type="submit"]').first().click()

    await expect(
      page.locator('input[type="password"]'),
      'it let a wrong password in',
    ).toBeVisible()

    const said = ((await page.locator('main').textContent()) ?? '').toLowerCase()
    expect(said, 'it bounced them back with no explanation').toMatch(
      /senha|password|incorret|wrong/u,
    )
  })

  /*
   * The same answer for an address with no account as for a wrong password.
   * Two answers would make this page a way of asking who is a member, from
   * somewhere anybody can load.
   */
  test('says the same thing about an address it has never seen', async ({ page }) => {
    const complaintFor = async (address: string): Promise<string> => {
      await page.goto('/pt')
      await page.locator('input[type="email"]').fill(address)
      await page.locator('input[type="password"]').fill('nao e essa a senha')
      await page.locator('button[type="submit"]').first().click()
      await expect(page.locator('[role="alert"]')).toBeVisible()
      return ((await page.locator('[role="alert"]').textContent()) ?? '').trim()
    }

    expect(await complaintFor('nobody-at-all@example.test')).toBe(await complaintFor(EMAIL))
  })
})
