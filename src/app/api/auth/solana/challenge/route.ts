import { NextRequest, NextResponse } from 'next/server'

import { checkSameOrigin } from '@/lib/auth/same-origin'
import { allowedDomains } from '@/lib/auth/sign-in-domains'
import { SolanaSignInError, issueSolanaChallenge } from '@/lib/auth/solana-siws'
import { clientIp, solanaAuthLimiter } from '@/lib/ratelimit'

/**
 * Sign-In With Solana challenge: POST `{ address }` returns the SIWS message
 * the wallet signs with `solana:signMessage`, and its nonce. The server keeps
 * the message under the nonce for 5 minutes, single use, and builds it for the
 * host the request reached — a domain or URI in the body is ignored. Only
 * this site's own pages may call it (same-origin.ts).
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

  const body: unknown = await request.json().catch(() => null)
  const address =
    body && typeof body === 'object'
      ? (body as { address?: unknown }).address
      : undefined
  if (typeof address !== 'string' || address.length === 0) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 })
  }

  try {
    return NextResponse.json(
      await issueSolanaChallenge({ address, origin: request.nextUrl.origin })
    )
  } catch (error) {
    if (error instanceof SolanaSignInError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error('[auth:solana] challenge failed:', message)
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
