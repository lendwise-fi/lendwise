export type CctpBridgeAuditStage =
  | 'trustline_checked'
  | 'change_trust_submitted'
  | 'usdc_approval_submitted'
  | 'burn_submitted'
  | 'attestation_ready'
  | 'mint_submitted'

export interface CctpBridgeAuditEvent {
  stage: CctpBridgeAuditStage
  sourceChain?: string
  sourceDomain?: number
  sourceChainId?: number
  evmTxHash?: string
  stellarTxHash?: string
  irisNonce?: string
  stellarRecipient?: string
  cctpForwarder?: string
  amountUsdc?: string
}

function shortAddress(value: string | undefined) {
  if (!value) return undefined
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}...${value.slice(-8)}`
}

export function sanitizeCctpBridgeAuditEvent(
  event: CctpBridgeAuditEvent
): CctpBridgeAuditEvent {
  return {
    ...event,
    stellarRecipient: shortAddress(event.stellarRecipient),
    cctpForwarder: shortAddress(event.cctpForwarder),
  }
}

export function logCctpBridgeAuditEvent(event: CctpBridgeAuditEvent): void {
  console.info('[cctp:bridge]', sanitizeCctpBridgeAuditEvent(event))
}
