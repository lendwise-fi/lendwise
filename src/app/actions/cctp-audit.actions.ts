'use server'

import { requireStellarSession } from '@/lib/auth/session-guard'
import {
  type CctpBridgeAuditEvent,
  logCctpBridgeAuditEvent,
} from '@/lib/bridge/cctp'

export async function recordCctpBridgeAuditEvent(
  event: CctpBridgeAuditEvent
): Promise<{ ok: true }> {
  await requireStellarSession()
  logCctpBridgeAuditEvent(event)
  return { ok: true }
}
