import { signOut } from '../../../../server/session.js'

/** Forgets the session. A POST, so a link cannot sign somebody out. */
export async function POST(request: Request): Promise<Response> {
  await signOut()

  return Response.redirect(new URL('/', request.url), 303)
}
