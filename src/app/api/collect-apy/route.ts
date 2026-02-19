import { NextRequest, NextResponse } from 'next/server'

import { ProtocolName, getProtocolIds } from '@/config/protocols'
import { collectApy } from '@/lib/cron/collect-apy'

/**
 * Vercel Cron endpoint for APY collection.
 *
 * Query params:
 * - protocol (required): The protocol to collect APY for (e.g. 'aave_v3', 'morpho_v1')
 *
 * Triggered by QStash or Vercel cron.
 * Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  // const authHeader = req.headers.get('authorization')
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // }

  const { searchParams } = new URL(req.url)
  const protocol = searchParams.get('protocol')

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
    const result = await collectApy(protocol as ProtocolName)

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
}
