'use server'

import {
  type CctpBridgeAuditEvent,
  logCctpBridgeAuditEvent,
} from '@/lib/bridge/cctp'

export async function recordCctpBridgeAuditEvent(
  event: CctpBridgeAuditEvent
): Promise<{ ok: true }> {
  logCctpBridgeAuditEvent(event)
  return { ok: true }
}
