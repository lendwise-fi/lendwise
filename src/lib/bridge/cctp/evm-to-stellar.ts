import { StrKey } from '@stellar/stellar-sdk'
import { type Address, type Hex, getAddress } from 'viem'

import { cctpTokenMessengerV2Abi } from './abis'
import { evmUsdcToStellarUsdcAtomic } from './amounts'
import {
  CCTP_STANDARD_FINALITY_THRESHOLD,
  type CctpTransferFinality,
  STELLAR_CCTP_DOMAIN,
  cctpFinalityThreshold,
} from './config'

export interface EvmToStellarCctpBurnInput {
  tokenMessengerV2: Address
  amount: bigint
  burnToken: Address
  cctpForwarder: string
  forwardRecipient: string
  maxFee: bigint
  maxFeeBps?: number
  minFinalityThreshold?: number
  finality?: CctpTransferFinality
  destinationDomain?: number
}

export interface EvmToStellarCctpBurnPlan {
  to: Address
  abi: typeof cctpTokenMessengerV2Abi
  functionName: 'depositForBurnWithHook'
  args: readonly [bigint, number, Hex, Address, Hex, bigint, number, Hex]
  destinationDomain: number
  minFinalityThreshold: number
  expectedStellarAtomicAmount: bigint
  minimumStellarAtomicAmountAfterMaxFee: bigint
  audit: {
    mintRecipientIsForwarder: true
    destinationCallerIsForwarder: true
    forwardRecipient: string
    usdcDecimals: {
      sourceEvm: 6
      destinationStellar: 7
    }
  }
  description: string
}

function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${[...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

function numberToUint32Bytes(value: number): Uint8Array {
  assertUint32(value, 'uint32 value')
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, false)
  return bytes
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function assertUint32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${label} must fit uint32`)
  }
}

function assertPositive(value: bigint, label: string): void {
  if (value <= 0n) {
    throw new Error(`${label} must be positive`)
  }
}

function assertNonNegative(value: bigint, label: string): void {
  if (value < 0n) {
    throw new Error(`${label} must be non-negative`)
  }
}

function assertFeeWithinBounds(
  amount: bigint,
  maxFee: bigint,
  maxFeeBps: number | undefined
): void {
  assertNonNegative(maxFee, 'CCTP maxFee')
  if (maxFee >= amount) {
    throw new Error(
      `CCTP maxFee (${maxFee.toString()}) must be less than the burn amount (${amount.toString()})`
    )
  }
  if (maxFeeBps === undefined) return
  if (!Number.isInteger(maxFeeBps) || maxFeeBps < 0 || maxFeeBps > 10_000) {
    throw new Error('CCTP maxFeeBps must be an integer between 0 and 10000')
  }
  const cap = (amount * BigInt(maxFeeBps)) / 10_000n
  if (maxFee > cap) {
    throw new Error(
      `CCTP maxFee (${maxFee.toString()}) exceeds ${maxFeeBps} bps (${cap.toString()})`
    )
  }
}

function assertStellarForwardRecipient(value: string): void {
  if (
    !StrKey.isValidEd25519PublicKey(value) &&
    !StrKey.isValidMed25519PublicKey(value) &&
    !StrKey.isValidContract(value)
  ) {
    throw new Error('forwardRecipient must be a Stellar G, M, or C strkey')
  }
}

export function stellarContractStrKeyToBytes32(value: string): Hex {
  if (!StrKey.isValidContract(value)) {
    throw new Error('CCTP forwarder must be a Stellar contract strkey')
  }
  const decoded = StrKey.decodeContract(value)
  if (decoded.length !== 32) {
    throw new Error(`Stellar contract decoded to ${decoded.length} bytes`)
  }
  return bytesToHex(decoded)
}

export function buildCctpForwarderHookData(
  forwardRecipient: string,
  trailingBytes: Uint8Array = new Uint8Array()
): Hex {
  assertStellarForwardRecipient(forwardRecipient)
  const recipientBytes = new TextEncoder().encode(forwardRecipient)
  return bytesToHex(
    concatBytes([
      new Uint8Array(24),
      numberToUint32Bytes(0),
      numberToUint32Bytes(recipientBytes.length),
      recipientBytes,
      trailingBytes,
    ])
  )
}

export function prepareEvmToStellarCctpBurnWithHook(
  input: EvmToStellarCctpBurnInput
): EvmToStellarCctpBurnPlan {
  assertPositive(input.amount, 'CCTP burn amount')
  assertFeeWithinBounds(input.amount, input.maxFee, input.maxFeeBps)

  const destinationDomain = input.destinationDomain ?? STELLAR_CCTP_DOMAIN
  const minFinalityThreshold =
    input.minFinalityThreshold ??
    (input.finality
      ? cctpFinalityThreshold(input.finality)
      : CCTP_STANDARD_FINALITY_THRESHOLD)
  assertUint32(destinationDomain, 'CCTP destinationDomain')
  assertUint32(minFinalityThreshold, 'CCTP minFinalityThreshold')

  const forwarderBytes32 = stellarContractStrKeyToBytes32(input.cctpForwarder)
  const hookData = buildCctpForwarderHookData(input.forwardRecipient)
  const burnToken = getAddress(input.burnToken)

  return {
    to: getAddress(input.tokenMessengerV2),
    abi: cctpTokenMessengerV2Abi,
    functionName: 'depositForBurnWithHook',
    args: [
      input.amount,
      destinationDomain,
      forwarderBytes32,
      burnToken,
      forwarderBytes32,
      input.maxFee,
      minFinalityThreshold,
      hookData,
    ],
    destinationDomain,
    minFinalityThreshold,
    expectedStellarAtomicAmount: evmUsdcToStellarUsdcAtomic(input.amount),
    minimumStellarAtomicAmountAfterMaxFee: evmUsdcToStellarUsdcAtomic(
      input.amount - input.maxFee
    ),
    audit: {
      mintRecipientIsForwarder: true,
      destinationCallerIsForwarder: true,
      forwardRecipient: input.forwardRecipient,
      usdcDecimals: {
        sourceEvm: 6,
        destinationStellar: 7,
      },
    },
    description:
      'CCTP V2 burn USDC on EVM and route Stellar mint through CctpForwarder',
  }
}
