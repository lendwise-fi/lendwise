/**
 * Whether a sign-in request comes from one of this deployment's own pages.
 *
 * The sign-in routes set the session cookie, so a cross-site page must not be
 * able to drive them: an auto-submitted form could otherwise plant another
 * account's session in the victim's browser. Next.js checks the origin of
 * server actions only, not of route handlers.
 *
 * - `Origin` present: its host must be one of `allowedHosts`
 *   (`allowedDomains()` of sign-in-domains.ts). A browser sends it on every
 *   POST and DELETE.
 * - `Origin` absent (a same-origin GET): `Sec-Fetch-Site` must be
 *   `same-origin`. Neither header means refused.
 * - A POST must be `application/json`: a form can only send urlencoded,
 *   multipart or text/plain, and a cross-site fetch with JSON needs a CORS
 *   preflight that these routes never grant.
 */
export type SameOriginCheck =
  { ok: true } | { ok: false; status: 403 | 415; error: string }

function originHost(origin: string): string | null {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.hostname.toLowerCase()
  } catch {
    return null
  }
}

function isJson(contentType: string | null): boolean {
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase()
  return mediaType === 'application/json'
}

export function checkSameOrigin(
  request: { method: string; headers: Headers },
  allowedHosts: ReadonlySet<string>
): SameOriginCheck {
  const origin = request.headers.get('origin')
  const sameOrigin =
    origin !== null
      ? allowedHosts.has(originHost(origin) ?? '')
      : request.headers.get('sec-fetch-site') === 'same-origin'
  if (!sameOrigin)
    return { ok: false, status: 403, error: 'Cross-site request refused' }
  if (
    request.method.toUpperCase() === 'POST' &&
    !isJson(request.headers.get('content-type'))
  )
    return {
      ok: false,
      status: 415,
      error: 'Content-Type must be application/json',
    }
  return { ok: true }
}
