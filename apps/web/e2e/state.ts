import { resolve } from 'node:path'

/** Where the signed-in cookie jar is kept between the setup and the specs. */
export const STATE_FILE = resolve(import.meta.dirname, '../.playwright/signed-in.json')
