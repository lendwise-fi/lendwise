import { NextRequest, NextResponse } from 'next/server'

import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import { collectApySpot } from '@/app/actions/apy-snapshots.actions'
import { ProtocolName, getProtocolIds } from '@/config/protocols'

/**
 * APY collection endpoint.
 *
 * Body (JSON):
 * - protocol (required): The protocol to collect APY for (e.g. 'aave_v3', 'morpho_v1')
 *
 * Triggered by QStash or Vercel cron.
 */
export const POST = verifySignatureAppRouter(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}))
  const protocol = body.protocol as string | undefined

  if (!protocol) {
    return NextResponse.json(
      { error: 'Missing required parameter: protocol' },
      { status: 400 }
    )
  }

  // Validate protocol
  // Strict matching only (e.g. 'aave_v3')
  const validIds = getProtocolIds() as string[]

  if (!validIds.includes(protocol)) {
    return NextResponse.json(
      {
        error: `Invalid protocol: ${protocol}. Supported: ${validIds.join(', ')}`,
      },
      { status: 400 }
    )
  }

  try {
    const result = await collectApySpot(protocol as ProtocolName)

    return NextResponse.json(result, {
      status: result.success ? 200 : 207,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(
      `[cron:collect-apy] Unhandled error for protocol ${protocol}:`,
      message
    )

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
})
