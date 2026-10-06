import { describe, expect, it } from 'vitest'

import { CctpIrisClient, parseCctpV2MessageHeader } from '..'

const txHash =
  '0x1111111111111111111111111111111111111111111111111111111111111111'

const recipient = '0x' + '22'.repeat(32)
const destinationCaller = '0x' + '33'.repeat(32)

function uint32Hex(value: number) {
  return value.toString(16).padStart(8, '0')
}

function cctpV2Message({
  sourceDomain = 6,
  destinationDomain = 27,
  minFinalityThreshold = 1000,
}: {
  sourceDomain?: number
  destinationDomain?: number
  minFinalityThreshold?: number
} = {}) {
  return ('0x' +
    uint32Hex(1) +
    uint32Hex(sourceDomain) +
    uint32Hex(destinationDomain) +
    '00'.repeat(32) +
    '11'.repeat(32) +
    recipient.slice(2) +
    destinationCaller.slice(2) +
    uint32Hex(minFinalityThreshold) +
    uint32Hex(minFinalityThreshold) +
    'deadbeef') as `0x${string}`
}

describe('CctpIrisClient', () => {
  it('builds v2 messages URLs for transaction hashes', () => {
    const client = new CctpIrisClient({
      baseUrl: 'https://iris-api-sandbox.circle.com',
    })

    expect(
      client.buildMessagesUrl({
        sourceDomainId: 6,
        transactionHash: txHash,
      })
    ).toBe(
      `https://iris-api-sandbox.circle.com/v2/messages/6?transactionHash=${txHash}`
    )
  })

  it('waits through unavailable and pending responses', async () => {
    const calls: string[] = []
    const fetchFn = async (url: string | URL | Request) => {
      calls.push(String(url))
      if (calls.length === 1) return new Response('', { status: 404 })
      if (calls.length === 2) return new Response('', { status: 429 })
      if (calls.length === 3) {
        return Response.json({
          messages: [{ message: '0x', attestation: 'PENDING' }],
        })
      }
      return Response.json({
        messages: [
          {
            message: '0x1234',
            attestation: '0xabcd',
            eventNonce: '42',
          },
        ],
      })
    }

    const client = new CctpIrisClient({
      baseUrl: 'https://iris-api-sandbox.circle.com',
      fetchFn: fetchFn as typeof fetch,
      pollIntervalMs: 0,
      timeoutMs: 1_000,
    })
    const attestation = await client.waitForAttestation({
      sourceDomainId: 6,
      transactionHash: txHash,
    })

    expect(calls).toHaveLength(4)
    expect(attestation.message).toBe('0x1234')
    expect(attestation.attestation).toBe('0xabcd')
    expect(attestation.eventNonce).toBe('42')
  })

  it('parses CCTP V2 message headers at Circle byte offsets', () => {
    const header = parseCctpV2MessageHeader(cctpV2Message())

    expect(header.sourceDomain).toBe(6)
    expect(header.destinationDomain).toBe(27)
    expect(header.recipient).toBe(recipient)
    expect(header.destinationCaller).toBe(destinationCaller)
    expect(header.minFinalityThreshold).toBe(1000)
  })

  it('rejects ready Iris messages that do not match the bridge plan', async () => {
    const client = new CctpIrisClient({
      baseUrl: 'https://iris-api-sandbox.circle.com',
      fetchFn: (async () =>
        Response.json({
          messages: [
            {
              message: cctpV2Message({ destinationDomain: 99 }),
              attestation: '0xabcd',
            },
          ],
        })) as typeof fetch,
      pollIntervalMs: 0,
      timeoutMs: 1_000,
    })

    await expect(
      client.waitForAttestation({
        sourceDomainId: 6,
        transactionHash: txHash,
        expectedMessage: {
          destinationDomain: 27,
          recipient,
          destinationCaller,
          minFinalityThreshold: 1000,
        },
      })
    ).rejects.toThrow(/destination domain/)
  })

  it('rejects malformed transaction hashes before fetch', async () => {
    const client = new CctpIrisClient({
      fetchFn: (async () => {
        throw new Error('fetch should not be called')
      }) as typeof fetch,
    })

    await expect(
      client.waitForAttestation({
        sourceDomainId: 6,
        transactionHash: '0x1234',
      })
    ).rejects.toThrow(/32-byte hex/)
  })
})
