// US-002, US-052
//
// The identity port's own contract, against real Supabase Auth.
//
// It was only ever run against the fake. CLAUDE.md is explicit about why that
// is not enough — "a fake that behaves differently makes every test using it
// pass for the wrong reason" — and the whole suite signs in through that fake,
// so it is the single most load-bearing stand-in in the repo. I then added
// `register` and `signIn` to the contract and still only held the fake to it.
//
// The two the real service could disagree about, either of which would be a
// security bug rather than a wrong number:
//
//   - the same address is always the same person, or somebody signs back in
//     to an empty library
//   - an unknown address refuses *identically* to a wrong password, or the
//     form becomes a way to ask who has an account here
//
// Skipped without credentials, because CI has none.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeIdentityProvider } from '@overtone/core/testing'
import { afterAll, describe, it } from 'vitest'
import { SupabaseIdentityProvider } from './supabase-identity-provider.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const projectUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
const publishableKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
const secretKey = process.env['SUPABASE_SECRET_KEY']

if (
  projectUrl === undefined ||
  publishableKey === undefined ||
  secretKey === undefined ||
  projectUrl.length === 0
) {
  describe('SupabaseIdentityProvider, live', () => {
    it.skip('needs NEXT_PUBLIC_SUPABASE_URL, the publishable key and the secret key', () => {})
  })
} else {
  const admin = { authorization: `Bearer ${secretKey}`, apikey: secretKey }

  /*
   * `.test` addresses, which cannot resolve anywhere.
   *
   * Belt and braces: the project has email confirmation off so nothing is
   * sent, and a link is generated through the admin API rather than mailed.
   * But a contract suite creating accounts must not be one typo away from
   * posting to somebody's real inbox.
   */
  const made = new Set<string>()
  let counted = 0
  const freshEmail = (): string => {
    counted += 1
    const email = `overtone-contract-${String(Date.now())}-${String(counted)}@example.test`
    made.add(email)
    return email
  }

  /** The token a clicked link would carry, without an inbox to read it from. */
  const tokenFor = async (email: string): Promise<string> => {
    made.add(email)
    const response = await fetch(`${projectUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { ...admin, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email }),
    })

    const payload = (await response.json()) as { hashed_token?: string }
    if (typeof payload.hashed_token !== 'string') {
      throw new Error(`no link token for ${email}: ${JSON.stringify(payload)}`)
    }

    return payload.hashed_token
  }

  /*
   * Every account this made, removed.
   *
   * A contract suite that leaves accounts behind turns `EMAIL_TAKEN` into a
   * test that passes on the first run and fails on the second — and leaves a
   * growing list of them in somebody's project.
   */
  afterAll(async () => {
    const listed = (await fetch(`${projectUrl}/auth/v1/admin/users?per_page=200`, {
      headers: admin,
    }).then((response) => response.json())) as { users?: ReadonlyArray<{ id: string; email: string }> }

    for (const user of listed.users ?? []) {
      if (!made.has(user.email)) continue
      await fetch(`${projectUrl}/auth/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: admin,
      })
    }
  })

  describeIdentityProvider('SupabaseIdentityProvider', () => {
    const known = freshEmail()

    return {
      provider: new SupabaseIdentityProvider({ projectUrl, publishableKey }),
      knownEmail: known,
      tokenFor,
      freshEmail,
      /*
       * Supabase validates deliverability when asked to send, and rejects
       * `.test`, `example.com` and `.invalid` alike — while `/signup` takes
       * `.test` without complaint. So there is no address that both proves
       * sending works and cannot reach a real person, and a contract suite
       * must not mail one. Everything after the send still runs here: the
       * token comes from the admin API instead of an inbox.
       */
      canSendLinks: false,
    }
  })
}
