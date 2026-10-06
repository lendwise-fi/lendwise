import { NextRequest, NextResponse } from 'next/server'

import { verifyStellarChallenge } from '@/lib/auth/stellar-sep10'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
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

    const res = NextResponse.json({ session, token_type: 'bearer' })
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
    const status = message.includes('not configured') ? 503 : 401
    return NextResponse.json({ error: message }, { status })
  }
}
