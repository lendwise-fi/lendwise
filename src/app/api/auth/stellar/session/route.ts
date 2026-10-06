import { NextRequest, NextResponse } from 'next/server'

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
  if (!session) {
    return NextResponse.json(
      { error: 'stellar session is invalid or expired' },
      { status: 401 }
    )
  }

  return NextResponse.json({ session })
}

export async function DELETE() {
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
