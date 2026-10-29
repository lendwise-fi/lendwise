import { NextRequest, NextResponse } from 'next/server'

import { checkSameOrigin } from '@/lib/auth/same-origin'
import { SOLANA_SESSION_COOKIE } from '@/lib/auth/session-guard'
import {
  isSolanaSessionRevoked,
  revokeSolanaSession,
} from '@/lib/auth/session-store'
import { allowedDomains } from '@/lib/auth/sign-in-domains'
import { verifySolanaSessionToken } from '@/lib/auth/solana-siws'

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SOLANA_SESSION_COOKIE)?.value
  if (!token) {
    return NextResponse.json(
      { error: 'solana session is missing' },
      { status: 401 }
    )
  }

  const session = verifySolanaSessionToken(token)
  if (!session || (await isSolanaSessionRevoked(session.sid))) {
    return NextResponse.json(
      { error: 'solana session is invalid or expired' },
      { status: 401 }
    )
  }

  return NextResponse.json({ session })
}

// Sign-out revokes the session server-side, so a copied cookie stops working
// immediately, not only when the cookie is cleared in this browser. It writes
// the cookie, so only this site's own pages may call it (same-origin.ts).
export async function DELETE(request: NextRequest) {
  const site = checkSameOrigin(request, allowedDomains())
  if (!site.ok)
    return NextResponse.json({ error: site.error }, { status: site.status })

  const token = request.cookies.get(SOLANA_SESSION_COOKIE)?.value
  const session = token ? verifySolanaSessionToken(token) : null
  if (session) {
    await revokeSolanaSession(session.sid, session.expiresAt)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SOLANA_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return res
}
