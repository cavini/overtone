import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing.js'

export default createMiddleware(routing)

export const config = {
  // Everything except API routes, Next's own assets, and files with an
  // extension. A locale prefix on an upload POST would just break it.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
