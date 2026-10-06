'use server'

import {
  BASE_FEE,
  Networks,
  Transaction,
  TransactionBuilder,
  rpc,
  xdr,
} from '@stellar/stellar-sdk'

import {
  assertSessionAddress,
  requireStellarSession,
} from '@/lib/auth/session-guard'
import {
  STELLAR_CCTP_CONTRACTS,
  assertStellarCctpMintAndForwardTransaction,
  cctpEnvironmentFromNetworkPassphrase,
  prepareStellarCctpMintAndForward,
} from '@/lib/bridge/cctp'

export interface PrepareStellarMintAndForwardInput {
  source: string
  message: `0x${string}` | string
  attestation: `0x${string}` | string
}

export interface PreparedStellarMintAndForwardResponse {
  transactionXdr: string
  networkPassphrase: string
  cctpForwarder: string
}

export interface SubmittedStellarBridgeTransaction {
  hash: string
  status: string
}

function stellarNetworkPassphrase() {
  return (
    process.env.STELLAR_NETWORK_PASSPHRASE ??
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ??
    Networks.TESTNET
  )
}

function stellarRpcUrl() {
  if (process.env.STELLAR_RPC_URL) return process.env.STELLAR_RPC_URL
  return stellarNetworkPassphrase() === Networks.PUBLIC
    ? 'https://mainnet.sorobanrpc.com'
    : 'https://soroban-testnet.stellar.org'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForStellarTransaction(
  server: rpc.Server,
  hash: string,
  timeoutMs = 60_000,
  pollIntervalMs = 1_000
) {
  const startedAt = Date.now()
  for (;;) {
    const result = await server.getTransaction(hash)
    const status = (result as { status?: string }).status
    if (status === 'SUCCESS') return status
    if (status && status !== 'NOT_FOUND') {
      throw new Error(
        `Stellar transaction ${hash} failed with status ${status}`
      )
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`timed out waiting for Stellar transaction ${hash}`)
    }
    await sleep(pollIntervalMs)
  }
}

export async function prepareStellarMintAndForwardTransaction(
  input: PrepareStellarMintAndForwardInput
): Promise<PreparedStellarMintAndForwardResponse> {
  assertSessionAddress(await requireStellarSession(), input.source)
  const networkPassphrase = stellarNetworkPassphrase()
  const environment = cctpEnvironmentFromNetworkPassphrase(networkPassphrase)
  const cctpForwarder =
    process.env.STELLAR_CCTP_FORWARDER ??
    STELLAR_CCTP_CONTRACTS[environment].cctpForwarder
  const server = new rpc.Server(stellarRpcUrl())
  const source = await server.getAccount(input.source)
  const plan = prepareStellarCctpMintAndForward({
    source: input.source,
    networkPassphrase,
    cctpForwarder,
    message: input.message,
    attestation: input.attestation,
  })
  const operation = xdr.Operation.fromXDR(plan.operationXdr, 'base64')
  const transaction = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(300)
    .build()
  const prepared = await server.prepareTransaction(transaction)

  return {
    transactionXdr: prepared.toXDR(),
    networkPassphrase,
    cctpForwarder,
  }
}

export async function submitSignedStellarBridgeTransaction(
  signedTransactionXdr: string
): Promise<SubmittedStellarBridgeTransaction> {
  const server = new rpc.Server(stellarRpcUrl())
  const networkPassphrase = stellarNetworkPassphrase()
  const environment = cctpEnvironmentFromNetworkPassphrase(networkPassphrase)
  const cctpForwarder =
    process.env.STELLAR_CCTP_FORWARDER ??
    STELLAR_CCTP_CONTRACTS[environment].cctpForwarder
  const session = await requireStellarSession()
  const transaction = new Transaction(signedTransactionXdr, networkPassphrase)
  assertStellarCctpMintAndForwardTransaction({ transaction, cctpForwarder })
  assertSessionAddress(session, transaction.source)
  const submitted = await server.sendTransaction(transaction)
  const status = (submitted as { status?: string }).status
  if (status && status !== 'PENDING' && status !== 'DUPLICATE') {
    throw new Error(`Stellar RPC rejected bridge transaction with ${status}`)
  }
  const hash = (submitted as { hash?: string }).hash
  if (!hash) {
    throw new Error('Stellar RPC response did not include a transaction hash')
  }
  const finalStatus = await waitForStellarTransaction(server, hash)
  return { hash, status: finalStatus }
}
