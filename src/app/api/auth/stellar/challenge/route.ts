import { NextRequest, NextResponse } from 'next/server'

import { issueStellarChallenge } from '@/lib/auth/stellar-sep10'

export async function GET(request: NextRequest) {
  try {
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
