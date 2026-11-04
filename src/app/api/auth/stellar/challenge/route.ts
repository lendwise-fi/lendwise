import { NextRequest, NextResponse } from 'next/server'

import { checkSameOrigin } from '@/lib/auth/same-origin'
import { allowedDomains, issueStellarChallenge } from '@/lib/auth/stellar-sep10'
import { clientIp, stellarAuthLimiter } from '@/lib/ratelimit'

/**
 * SEP-10 challenge endpoint.
 *
 * GET `?account=G…` is the SEP-10 shape; POST `{ address }` is what the
 * LendWise client sends. Both return the same server-signed challenge
 * transaction (sequence 0, ManageData nonce, 5-minute time bounds), bound to
 * the host the request reached. Only this site's own pages may call it
 * (same-origin.ts).
 */
async function refused(request: NextRequest) {
  const site = checkSameOrigin(request, allowedDomains())
  if (!site.ok)
    return NextResponse.json({ error: site.error }, { status: site.status })
  const { success, retryAfter } = await stellarAuthLimiter.limit(
    clientIp(request.headers)
  )
  if (success) return null
  return NextResponse.json(
    { error: 'too many sign-in attempts, try again in a minute' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  )
}

async function challengeResponse(request: NextRequest, address: unknown) {
  if (typeof address !== 'string' || address.length === 0) {
    return NextResponse.json({ error: 'account is required' }, { status: 400 })
  }
  try {
    // NextURL normalizes loopback hosts; SEP-10 must match the browser's host.
    return NextResponse.json(
      await issueStellarChallenge({
        address,
        domain: (
          request.headers.get('host')?.split(':')[0] ?? ''
        ).toLowerCase(),
      })
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = /not configured|required in production/.test(message)
      ? 503
      : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function GET(request: NextRequest) {
  const refusal = await refused(request)
  if (refusal) return refusal
  return challengeResponse(request, request.nextUrl.searchParams.get('account'))
}

export async function POST(request: NextRequest) {
  const refusal = await refused(request)
  if (refusal) return refusal
  const body = (await request.json().catch(() => ({}))) as {
    address?: unknown
    account?: unknown
  }
  return challengeResponse(request, body.address ?? body.account)
}
