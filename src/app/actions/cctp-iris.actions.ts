'use server'

import { Networks } from '@stellar/stellar-sdk'

import { requireStellarSession } from '@/lib/auth/session-guard'
import { allowRequest } from '@/lib/auth/session-store'
import {
  CctpIrisClient,
  type ReadyCctpAttestation,
  cctpEnvironmentFromNetworkPassphrase,
} from '@/lib/bridge/cctp'

// Polling Circle's attestation API spends shared quota, so it is limited per
// signed-in account.
const ATTESTATION_POLLS_PER_MINUTE = 60

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
  const session = await requireStellarSession()
  const allowed = await allowRequest({
    key: `iris:${session.address}`,
    limit: ATTESTATION_POLLS_PER_MINUTE,
    windowSeconds: 60,
  })
  if (!allowed) {
    throw new Error('Attestation polling rate limit reached, try again shortly')
  }
  const client = new CctpIrisClient({
    environment: cctpEnvironmentFromNetworkPassphrase(
      stellarNetworkPassphrase()
    ),
  })
  return client.waitForAttestation(input)
}
