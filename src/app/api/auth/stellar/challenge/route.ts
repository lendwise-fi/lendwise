import { NextRequest, NextResponse } from 'next/server'

import { allowRequest } from '@/lib/auth/session-store'
import { issueStellarChallenge } from '@/lib/auth/stellar-sep10'

const CHALLENGES_PER_MINUTE = 20

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

async function rateLimited(request: NextRequest) {
  const allowed = await allowRequest({
    key: `challenge:${clientIp(request)}`,
    limit: CHALLENGES_PER_MINUTE,
    windowSeconds: 60,
  })
  if (allowed) return null
  return NextResponse.json(
    { error: 'too many sign-in attempts, try again in a minute' },
    { status: 429 }
  )
}

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimited(request)
    if (limited) return limited

    const address = request.nextUrl.searchParams.get('account')
    if (!address) {
      return NextResponse.json(
        { error: 'account is required' },
        { status: 400 }
      )
    }

    return NextResponse.json(await issueStellarChallenge(address))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('not configured') ? 503 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimited(request)
    if (limited) return limited

    const body = (await request.json()) as {
      address?: unknown
      account?: unknown
    }
    const address = body.address ?? body.account
    if (typeof address !== 'string') {
      return NextResponse.json(
        { error: 'address is required' },
        { status: 400 }
      )
    }

    return NextResponse.json(await issueStellarChallenge(address))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('not configured') ? 503 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
