import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
import { STATE_FILE } from './e2e/state.js'

/*
 * The one thing M4 asks for that no other suite can check: that both
 * locales hold together on a phone.
 *
 * 360 px wide, not 390. It is the narrowest screen anybody still uses, and
 * it is where the library row broke — the title squeezed to 24 px and the
 * row ran off the side — which nothing caught, because nothing had ever
 * looked. Passing at 390 and failing at 360 is the normal way this breaks.
 */
const envFile = resolve(import.meta.dirname, '../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const PORT = 3100

export default defineConfig({
  testDir: './e2e',
  // A phone is one screen. Two of them racing for the same dev server, with
  // the same one shared library behind it, is a flake generator.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    viewport: { width: 360, height: 740 },
    // Phones are touch screens, and `@media (hover: hover)` rules that only
    // ever ran on a mouse are part of what is being checked.
    hasTouch: true,
    isMobile: true,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'sign in', testMatch: /sign-in\.setup\.ts/u },
    {
      name: 'phone',
      testMatch: /\.spec\.ts/u,
      dependencies: ['sign in'],
      use: { storageState: STATE_FILE },
    },
  ],
  webServer: {
    command: `pnpm next dev --port ${String(PORT)}`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 120_000,
  },
})
