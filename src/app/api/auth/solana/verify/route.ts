import { NextRequest, NextResponse } from 'next/server'

import { checkSameOrigin } from '@/lib/auth/same-origin'
import { SOLANA_SESSION_COOKIE } from '@/lib/auth/session-guard'
import { allowedDomains } from '@/lib/auth/sign-in-domains'
import {
  SolanaSignInError,
  verifySolanaChallenge,
} from '@/lib/auth/solana-siws'
import { clientIp, solanaAuthLimiter } from '@/lib/ratelimit'

/**
 * Sign-In With Solana verification: POST `{ address, nonce, signature }`,
 * the signature being the base64 of the 64 bytes `solana:signMessage`
 * returned. The server takes its own copy of the message out of the store by
 * nonce — which burns the nonce, success or not — and checks the signature
 * over those bytes; a `message` in the body is never read. On success the
 * session is set as an httpOnly cookie — the client never holds the token —
 * and `/api/auth/solana/session` reads it back after a refresh.
 *
 * Same-origin JSON only (same-origin.ts): a cross-site form could otherwise
 * post an attacker's signed challenge and plant their session in this
 * browser.
 */
export async function POST(request: NextRequest) {
  const site = checkSameOrigin(request, allowedDomains())
  if (!site.ok)
    return NextResponse.json({ error: site.error }, { status: site.status })

  const { success, retryAfter } = await solanaAuthLimiter.limit(
    clientIp(request.headers)
  )
  if (!success) {
    return NextResponse.json(
      { error: 'too many sign-in attempts, try again in a minute' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const raw: unknown = await request.json().catch(() => null)
  const body = (raw && typeof raw === 'object' ? raw : {}) as {
    address?: unknown
    nonce?: unknown
    signature?: unknown
  }
  for (const field of ['address', 'nonce', 'signature'] as const) {
    if (typeof body[field] !== 'string') {
      return NextResponse.json(
        { error: `${field} is required` },
        { status: 400 }
      )
    }
  }

  try {
    const { session, token } = await verifySolanaChallenge({
      address: body.address as string,
      nonce: body.nonce as string,
      signature: body.signature as string,
      origin: request.nextUrl.origin,
    })

    const res = NextResponse.json({ session })
    res.cookies.set(SOLANA_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(session.expiresAt * 1000),
    })
    return res
  } catch (error) {
    if (error instanceof SolanaSignInError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error('[auth:solana] verification failed:', message)
    return NextResponse.json(
      {
        error: /not configured|required in production/.test(message)
          ? message
          : 'Solana sign-in is unavailable',
      },
      { status: 503 }
    )
  }
}
