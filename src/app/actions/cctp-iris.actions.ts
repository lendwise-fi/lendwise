'use server'

import { Networks } from '@stellar/stellar-sdk'

import {
  CctpIrisClient,
  type ReadyCctpAttestation,
  cctpEnvironmentFromNetworkPassphrase,
} from '@/lib/bridge/cctp'

function stellarNetworkPassphrase() {
  return (
    process.env.STELLAR_NETWORK_PASSPHRASE ??
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ??
    Networks.TESTNET
  )
}

export async function waitForCctpAttestation(input: {
  sourceDomainId: number
  transactionHash: string
  expectedMessage?: {
    destinationDomain?: number
    recipient?: `0x${string}` | string
    destinationCaller?: `0x${string}` | string
    minFinalityThreshold?: number
  }
}): Promise<ReadyCctpAttestation> {
  const client = new CctpIrisClient({
    environment: cctpEnvironmentFromNetworkPassphrase(
      stellarNetworkPassphrase()
    ),
  })
  return client.waitForAttestation(input)
}
