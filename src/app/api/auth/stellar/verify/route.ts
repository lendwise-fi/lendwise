import { NextRequest, NextResponse } from 'next/server'

import { verifyStellarChallenge } from '@/lib/auth/stellar-sep10'
import { clientIp, stellarAuthLimiter } from '@/lib/ratelimit'

/**
 * SEP-10 verification: the wallet-signed challenge comes back here. On
 * success the session is set as an httpOnly cookie — the client never holds
 * the token — and `/api/auth/stellar/session` reads it back after a refresh.
 */
export async function POST(request: NextRequest) {
  const { success, retryAfter } = await stellarAuthLimiter.limit(
    clientIp(request.headers)
  )
  if (!success) {
    return NextResponse.json(
      { error: 'too many sign-in attempts, try again in a minute' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      address?: unknown
      account?: unknown
      transaction?: unknown
      transactionXdr?: unknown
    }
    const address = body.address ?? body.account
    const transactionXdr = body.transactionXdr ?? body.transaction
    if (typeof address !== 'string') {
      return NextResponse.json(
        { error: 'address is required' },
        { status: 400 }
      )
    }
    if (typeof transactionXdr !== 'string') {
      return NextResponse.json(
        { error: 'transactionXdr is required' },
        { status: 400 }
      )
    }

    const { session, token } = await verifyStellarChallenge({
      address,
      transactionXdr,
    })

    const res = NextResponse.json({ session })
    res.cookies.set('stellar_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(session.expiresAt * 1000),
    })
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = /not configured|required in production/.test(message)
      ? 503
      : 401
    return NextResponse.json({ error: message }, { status })
  }
}
