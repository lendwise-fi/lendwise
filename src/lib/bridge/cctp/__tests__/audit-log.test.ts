import { describe, expect, it, vi } from 'vitest'

import { logCctpBridgeAuditEvent, sanitizeCctpBridgeAuditEvent } from '..'

describe('CCTP bridge audit logging', () => {
  it('redacts long Stellar identifiers while keeping hashes intact', () => {
    expect(
      sanitizeCctpBridgeAuditEvent({
        stage: 'mint_submitted',
        stellarRecipient:
          'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57',
        cctpForwarder:
          'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
        evmTxHash:
          '0x1111111111111111111111111111111111111111111111111111111111111111',
        stellarTxHash:
          '2222222222222222222222222222222222222222222222222222222222222222',
      })
    ).toMatchObject({
      stellarRecipient: 'GDVEU3DD...I3JCZA57',
      cctpForwarder: 'CA66Q2WF...JK4T4VSZ',
      evmTxHash:
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      stellarTxHash:
        '2222222222222222222222222222222222222222222222222222222222222222',
    })
  })

  it('writes a structured server log event', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logCctpBridgeAuditEvent({
      stage: 'burn_submitted',
      sourceChain: 'base',
      sourceDomain: 6,
      sourceChainId: 8453,
    })

    expect(spy).toHaveBeenCalledWith(
      '[cctp:bridge]',
      expect.objectContaining({
        stage: 'burn_submitted',
        sourceChain: 'base',
        sourceDomain: 6,
        sourceChainId: 8453,
      })
    )
    spy.mockRestore()
  })
})
