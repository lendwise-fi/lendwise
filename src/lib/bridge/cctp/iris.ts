import { type CctpEnvironment, cctpIrisBaseUrl } from './config'

export interface CctpIrisMessage {
  message: `0x${string}`
  attestation: `0x${string}` | 'PENDING'
  eventNonce?: string
  decodedMessage?: unknown
}

export interface CctpIrisMessagesResponse {
  messages: CctpIrisMessage[]
}

const CCTP_V2_HEADER_LENGTH = 148

export interface CctpV2MessageHeader {
  version: number
  sourceDomain: number
  destinationDomain: number
  nonce: `0x${string}`
  sender: `0x${string}`
  recipient: `0x${string}`
  destinationCaller: `0x${string}`
  minFinalityThreshold: number
  finalityThresholdExecuted: number
}

export interface ExpectedCctpV2Message {
  destinationDomain?: number
  recipient?: `0x${string}` | string
  destinationCaller?: `0x${string}` | string
  minFinalityThreshold?: number
}

export interface ReadyCctpAttestation {
  sourceDomainId: number
  transactionHash?: string
  nonce?: string
  message: `0x${string}`
  attestation: `0x${string}`
  eventNonce?: string
  raw: CctpIrisMessage
}

export interface CctpIrisClientOptions {
  baseUrl?: string
  environment?: CctpEnvironment
  fetchFn?: typeof fetch
  pollIntervalMs?: number
  timeoutMs?: number
}

export interface WaitForCctpAttestationInput {
  sourceDomainId: number
  transactionHash?: string
  nonce?: string
  expectedMessage?: ExpectedCctpV2Message
}

function hexToBytes(value: string, label: string): Uint8Array {
  const normalized = value.startsWith('0x') ? value.slice(2) : value
  if (!/^[0-9a-fA-F]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be an even-length hex string`)
  }
  return Uint8Array.from(Buffer.from(normalized, 'hex'))
}

function bytes32Hex(bytes: Uint8Array, offset: number): `0x${string}` {
  return `0x${Buffer.from(bytes.slice(offset, offset + 32)).toString('hex')}`
}

function uint32(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getUint32(offset, false)
}

function normalizeBytes32(value: string, label: string): `0x${string}` {
  const bytes = hexToBytes(value, label)
  if (bytes.length !== 32) {
    throw new Error(`${label} must be exactly 32 bytes`)
  }
  return `0x${Buffer.from(bytes).toString('hex')}`
}

export function parseCctpV2MessageHeader(message: string): CctpV2MessageHeader {
  const bytes = hexToBytes(message, 'CCTP message')
  if (bytes.length < CCTP_V2_HEADER_LENGTH) {
    throw new Error('CCTP V2 message is shorter than the 148-byte header')
  }
  return {
    version: uint32(bytes, 0),
    sourceDomain: uint32(bytes, 4),
    destinationDomain: uint32(bytes, 8),
    nonce: bytes32Hex(bytes, 12),
    sender: bytes32Hex(bytes, 44),
    recipient: bytes32Hex(bytes, 76),
    destinationCaller: bytes32Hex(bytes, 108),
    minFinalityThreshold: uint32(bytes, 140),
    finalityThresholdExecuted: uint32(bytes, 144),
  }
}

function assertExpectedCctpMessage(
  input: WaitForCctpAttestationInput,
  message: string
): void {
  if (!input.expectedMessage) return
  const header = parseCctpV2MessageHeader(message)
  if (header.sourceDomain !== input.sourceDomainId) {
    throw new Error('CCTP message source domain does not match request')
  }
  const expected = input.expectedMessage
  if (
    expected.destinationDomain !== undefined &&
    header.destinationDomain !== expected.destinationDomain
  ) {
    throw new Error(
      'CCTP message destination domain does not match bridge plan'
    )
  }
  if (
    expected.recipient &&
    header.recipient !== normalizeBytes32(expected.recipient, 'CCTP recipient')
  ) {
    throw new Error('CCTP message recipient does not match bridge plan')
  }
  if (
    expected.destinationCaller &&
    header.destinationCaller !==
      normalizeBytes32(expected.destinationCaller, 'CCTP destinationCaller')
  ) {
    throw new Error(
      'CCTP message destination caller does not match bridge plan'
    )
  }
  if (
    expected.minFinalityThreshold !== undefined &&
    header.minFinalityThreshold !== expected.minFinalityThreshold
  ) {
    throw new Error(
      'CCTP message finality threshold does not match bridge plan'
    )
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function validateWaitInput(input: WaitForCctpAttestationInput): void {
  if (!Number.isInteger(input.sourceDomainId) || input.sourceDomainId < 0) {
    throw new Error('sourceDomainId must be a non-negative integer')
  }
  if (!input.transactionHash && !input.nonce) {
    throw new Error('transactionHash or nonce is required')
  }
  if (
    input.transactionHash &&
    !/^(0x)?[a-fA-F0-9]{64}$/.test(input.transactionHash)
  ) {
    throw new Error('transactionHash must be a 32-byte hex string')
  }
}

function isReadyMessage(
  message: CctpIrisMessage
): message is CctpIrisMessage & { attestation: `0x${string}` } {
  return (
    message.message !== '0x' &&
    message.attestation !== 'PENDING' &&
    message.attestation.startsWith('0x')
  )
}

export class CctpIrisClient {
  private readonly baseUrl: string
  private readonly fetchFn: typeof fetch
  private readonly pollIntervalMs: number
  private readonly timeoutMs: number

  constructor(options: CctpIrisClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ??
      cctpIrisBaseUrl(options.environment === 'mainnet' ? 'mainnet' : 'testnet')
    this.fetchFn = options.fetchFn ?? fetch
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000
    this.timeoutMs = options.timeoutMs ?? 20 * 60_000
  }

  buildMessagesUrl(input: WaitForCctpAttestationInput): string {
    validateWaitInput(input)
    const url = new URL(`${this.baseUrl}/v2/messages/${input.sourceDomainId}`)
    if (input.transactionHash) {
      url.searchParams.set('transactionHash', input.transactionHash)
    }
    if (input.nonce) {
      url.searchParams.set('nonce', input.nonce)
    }
    return url.toString()
  }

  async getMessages(
    input: WaitForCctpAttestationInput
  ): Promise<CctpIrisMessagesResponse | undefined> {
    const response = await this.fetchFn(this.buildMessagesUrl(input))
    if (response.status === 404 || response.status === 429) {
      return undefined
    }
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Circle Iris messages request failed: ${response.status} ${response.statusText}. ${errorText}`
      )
    }
    return (await response.json()) as CctpIrisMessagesResponse
  }

  async waitForAttestation(
    input: WaitForCctpAttestationInput
  ): Promise<ReadyCctpAttestation> {
    validateWaitInput(input)
    const startedAt = Date.now()

    for (;;) {
      const response = await this.getMessages(input)
      const ready = response?.messages?.find(isReadyMessage)
      if (ready) {
        assertExpectedCctpMessage(input, ready.message)
        return {
          sourceDomainId: input.sourceDomainId,
          transactionHash: input.transactionHash,
          nonce: input.nonce,
          message: ready.message,
          attestation: ready.attestation,
          eventNonce: ready.eventNonce,
          raw: ready,
        }
      }

      if (Date.now() - startedAt > this.timeoutMs) {
        throw new Error(
          `timed out waiting for Circle Iris attestation for source domain ${input.sourceDomainId}`
        )
      }
      await sleep(this.pollIntervalMs)
    }
  }
}
