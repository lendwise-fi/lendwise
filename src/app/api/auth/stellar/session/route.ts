import { NextRequest, NextResponse } from 'next/server'

import {
  isStellarSessionRevoked,
  revokeStellarSession,
} from '@/lib/auth/session-store'
import { verifySessionToken } from '@/lib/auth/stellar-sep10'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('stellar_session')?.value
  if (!token) {
    return NextResponse.json(
      { error: 'stellar session is missing' },
      { status: 401 }
    )
  }

  const session = verifySessionToken(token)
  if (!session || (await isStellarSessionRevoked(session.sid))) {
    return NextResponse.json(
      { error: 'stellar session is invalid or expired' },
      { status: 401 }
    )
  }

  return NextResponse.json({ session })
}

// Sign-out revokes the session server-side, so a copied cookie stops working
// immediately, not only when the cookie is cleared in this browser.
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get('stellar_session')?.value
  const session = token ? verifySessionToken(token) : null
  if (session) {
    await revokeStellarSession(session.sid, session.expiresAt)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('stellar_session', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return res
}
