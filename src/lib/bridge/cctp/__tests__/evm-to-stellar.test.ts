import { Keypair, StrKey } from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'

import {
  CCTP_FAST_FINALITY_THRESHOLD,
  STELLAR_CCTP_DOMAIN,
  buildCctpForwarderHookData,
  decimalUsdcToEvmAtomic,
  evmUsdcToStellarUsdcAtomic,
  prepareEvmToStellarCctpBurnWithHook,
  stellarContractStrKeyToBytes32,
} from '..'

function contract(seed: number): string {
  return StrKey.encodeContract(Buffer.alloc(32, seed))
}

describe('EVM to Stellar CCTP burn planning', () => {
  it('rescales EVM 6-decimal USDC to Stellar 7-decimal USDC', () => {
    expect(evmUsdcToStellarUsdcAtomic(1_250_000n)).toBe(12_500_000n)
    expect(decimalUsdcToEvmAtomic('1.25')).toBe(1_250_000n)
  })

  it('encodes CctpForwarder hook data with the documented wire format', () => {
    const recipient = 'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57'
    expect(buildCctpForwarderHookData(recipient)).toBe(
      '0x00000000000000000000000000000000000000000000000000000000000000384744564555334444344b4f46454356363656494857455a4f5958345a4b5233575632374c343634534949504f5532495549334a435a413537'
    )
  })

  it('routes mintRecipient and destinationCaller to the Stellar forwarder', () => {
    const forwarder = contract(1)
    const forwarderBytes32 = stellarContractStrKeyToBytes32(forwarder)
    const plan = prepareEvmToStellarCctpBurnWithHook({
      tokenMessengerV2: '0x1111111111111111111111111111111111111111',
      burnToken: '0x2222222222222222222222222222222222222222',
      amount: 25_000_000n,
      cctpForwarder: forwarder,
      forwardRecipient: Keypair.random().publicKey(),
      maxFee: 50_000n,
      maxFeeBps: 50,
      finality: 'fast',
    })

    expect(plan.functionName).toBe('depositForBurnWithHook')
    expect(plan.args[1]).toBe(STELLAR_CCTP_DOMAIN)
    expect(plan.args[2]).toBe(forwarderBytes32)
    expect(plan.args[4]).toBe(forwarderBytes32)
    expect(plan.args[6]).toBe(CCTP_FAST_FINALITY_THRESHOLD)
    expect(plan.expectedStellarAtomicAmount).toBe(250_000_000n)
    expect(plan.minimumStellarAtomicAmountAfterMaxFee).toBe(249_500_000n)
    expect(plan.audit.mintRecipientIsForwarder).toBe(true)
    expect(plan.audit.destinationCallerIsForwarder).toBe(true)
  })

  it('rejects a maxFee that can consume the whole burn or exceeds bps cap', () => {
    const input = {
      tokenMessengerV2: '0x1111111111111111111111111111111111111111' as const,
      burnToken: '0x2222222222222222222222222222222222222222' as const,
      amount: 25_000_000n,
      cctpForwarder: contract(1),
      forwardRecipient: Keypair.random().publicKey(),
    }

    expect(() =>
      prepareEvmToStellarCctpBurnWithHook({
        ...input,
        maxFee: 25_000_000n,
      })
    ).toThrow(/less than the burn amount/)

    expect(() =>
      prepareEvmToStellarCctpBurnWithHook({
        ...input,
        maxFee: 200_000n,
        maxFeeBps: 50,
      })
    ).toThrow(/exceeds 50 bps/)
  })
})
