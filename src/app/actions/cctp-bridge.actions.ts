'use server'

import { Horizon, Networks, Transaction } from '@stellar/stellar-sdk'
import { type Address, getAddress, zeroAddress } from 'viem'

import {
  assertSessionAddress,
  requireStellarSession,
} from '@/lib/auth/session-guard'
import {
  CCTP_EVM_CHAIN_IDS,
  CCTP_EVM_DOMAINS,
  type CctpEvmChainSlug,
  type CctpTransferFinality,
  STELLAR_CCTP_CONTRACTS,
  type StellarTrustlineStatus,
  buildChangeTrustTransactionXdr,
  cctpEnvironmentFromNetworkPassphrase,
  decimalUsdcToEvmAtomic,
  evmAtomicUsdcToDecimal,
  loadTrustlineStatus,
  prepareEvmToStellarCctpBurnWithHook,
  stellarUsdcAsset,
} from '@/lib/bridge/cctp'

export interface BridgeTrustlineResponse extends StellarTrustlineStatus {
  changeTrustRequired: boolean
}

export interface SerializedEvmCctpBurnPlan {
  to: Address
  abi: ReturnType<typeof prepareEvmToStellarCctpBurnWithHook>['abi']
  functionName: 'depositForBurnWithHook'
  args: readonly [
    string,
    number,
    string,
    Address,
    string,
    string,
    number,
    string,
  ]
  sourceDomain: number
  sourceChainId: number
  destinationDomain: number
  minFinalityThreshold: number
  amountUsdc: string
  maxFeeUsdc: string
  expectedStellarAtomicAmount: string
  minimumStellarAtomicAmountAfterMaxFee: string
  cctpForwarder: string
  audit: {
    mintRecipientIsForwarder: true
    destinationCallerIsForwarder: true
    forwardRecipient: string
    usdcDecimals: {
      sourceEvm: 6
      destinationStellar: 7
    }
  }
}

export interface PrepareEvmToStellarBridgeInput {
  sourceChain: CctpEvmChainSlug
  amountUsdc: string
  stellarRecipient: string
  finality?: CctpTransferFinality
  maxFeeUsdc?: string
  maxFeeBps?: number
}

function stellarNetworkPassphrase() {
  return (
    process.env.STELLAR_NETWORK_PASSPHRASE ??
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ??
    Networks.TESTNET
  )
}

function horizonUrl() {
  if (process.env.STELLAR_HORIZON_URL) return process.env.STELLAR_HORIZON_URL
  return stellarNetworkPassphrase() === Networks.PUBLIC
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org'
}

function envNameForChain(sourceChain: CctpEvmChainSlug, suffix: string) {
  return `CCTP_EVM_${sourceChain.toUpperCase()}_${suffix}`
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function requiredAddressEnv(name: string): Address {
  const address = getAddress(requiredEnv(name))
  if (address === zeroAddress) {
    throw new Error(`${name} must not be the zero address`)
  }
  return address
}

function resolveEvmCctpConfig(sourceChain: CctpEvmChainSlug) {
  const sourceDomain =
    Number(process.env[envNameForChain(sourceChain, 'DOMAIN')]) ||
    CCTP_EVM_DOMAINS[sourceChain]
  const sourceChainId =
    Number(process.env[envNameForChain(sourceChain, 'CHAIN_ID')]) ||
    CCTP_EVM_CHAIN_IDS[sourceChain]

  if (!Number.isInteger(sourceChainId) || sourceChainId <= 0) {
    throw new Error('EVM chainId is not configured for CCTP source chain')
  }

  return {
    sourceDomain,
    sourceChainId,
    tokenMessengerV2: requiredAddressEnv(
      envNameForChain(sourceChain, 'TOKEN_MESSENGER_V2')
    ),
    usdc: requiredAddressEnv(envNameForChain(sourceChain, 'USDC')),
  }
}

export async function checkStellarUsdcTrustline(
  address: string
): Promise<BridgeTrustlineResponse> {
  assertSessionAddress(await requireStellarSession(), address)
  const environment = cctpEnvironmentFromNetworkPassphrase(
    stellarNetworkPassphrase()
  )
  const status = await loadTrustlineStatus({
    address,
    asset: stellarUsdcAsset(environment),
    horizonUrl: horizonUrl(),
  })
  return { ...status, changeTrustRequired: !status.exists }
}

export async function buildStellarUsdcChangeTrustXdr(address: string): Promise<{
  transactionXdr: string
  networkPassphrase: string
  asset: { code: string; issuer: string }
}> {
  assertSessionAddress(await requireStellarSession(), address)
  const networkPassphrase = stellarNetworkPassphrase()
  const environment = cctpEnvironmentFromNetworkPassphrase(networkPassphrase)
  const asset = stellarUsdcAsset(environment)
  const server = new Horizon.Server(horizonUrl())
  const account = await server.loadAccount(address)
  return {
    transactionXdr: buildChangeTrustTransactionXdr({
      source: address,
      networkPassphrase,
      accountSequence: account.sequence,
      asset,
    }),
    networkPassphrase,
    asset,
  }
}

function assertSignedChangeTrustForAsset({
  signedTransactionXdr,
  networkPassphrase,
  asset,
}: {
  signedTransactionXdr: string
  networkPassphrase: string
  asset: { code: string; issuer: string }
}): Transaction {
  const transaction = new Transaction(signedTransactionXdr, networkPassphrase)
  if (transaction.operations.length !== 1) {
    throw new Error(
      'Stellar ChangeTrust transaction must contain exactly one operation'
    )
  }
  const operation = transaction.operations[0] as {
    type?: string
    line?: {
      getCode?: () => string
      getIssuer?: () => string | undefined
      code?: string
      issuer?: string
    }
  }
  if (operation.type !== 'changeTrust') {
    throw new Error('Stellar transaction must be a ChangeTrust operation')
  }
  const code = operation.line?.getCode?.() ?? operation.line?.code
  const issuer = operation.line?.getIssuer?.() ?? operation.line?.issuer
  if (code !== asset.code || issuer !== asset.issuer) {
    throw new Error('Stellar ChangeTrust asset does not match configured USDC')
  }
  return transaction
}

export async function submitSignedStellarUsdcChangeTrustTransaction(
  signedTransactionXdr: string
): Promise<{ hash: string; successful: boolean }> {
  const session = await requireStellarSession()
  const networkPassphrase = stellarNetworkPassphrase()
  const environment = cctpEnvironmentFromNetworkPassphrase(networkPassphrase)
  const asset = stellarUsdcAsset(environment)
  const transaction = assertSignedChangeTrustForAsset({
    signedTransactionXdr,
    networkPassphrase,
    asset,
  })
  assertSessionAddress(session, transaction.source)
  const server = new Horizon.Server(horizonUrl())
  const submitted = await server.submitTransaction(transaction)
  const hash = (submitted as { hash?: string }).hash
  if (!hash) {
    throw new Error(
      'Stellar Horizon response did not include a transaction hash'
    )
  }
  return {
    hash,
    successful: Boolean((submitted as { successful?: boolean }).successful),
  }
}

export async function prepareEvmToStellarBridgeBurn(
  input: PrepareEvmToStellarBridgeInput
): Promise<SerializedEvmCctpBurnPlan> {
  // The Stellar recipient decides where the minted USDC goes, so it must be
  // the account the caller proved control of.
  assertSessionAddress(await requireStellarSession(), input.stellarRecipient)
  const environment = cctpEnvironmentFromNetworkPassphrase(
    stellarNetworkPassphrase()
  )
  const evm = resolveEvmCctpConfig(input.sourceChain)
  const amount = decimalUsdcToEvmAtomic(input.amountUsdc)
  const maxFee = input.maxFeeUsdc
    ? decimalUsdcToEvmAtomic(input.maxFeeUsdc)
    : (amount * 5n) / 10_000n
  const cctpForwarder =
    process.env.STELLAR_CCTP_FORWARDER ??
    STELLAR_CCTP_CONTRACTS[environment].cctpForwarder

  const plan = prepareEvmToStellarCctpBurnWithHook({
    tokenMessengerV2: evm.tokenMessengerV2,
    amount,
    burnToken: evm.usdc,
    cctpForwarder,
    forwardRecipient: input.stellarRecipient,
    maxFee,
    maxFeeBps: input.maxFeeBps ?? 50,
    finality: input.finality ?? 'fast',
  })

  return {
    to: plan.to,
    abi: plan.abi,
    functionName: plan.functionName,
    args: [
      plan.args[0].toString(),
      plan.args[1],
      plan.args[2],
      plan.args[3],
      plan.args[4],
      plan.args[5].toString(),
      plan.args[6],
      plan.args[7],
    ],
    sourceDomain: evm.sourceDomain,
    sourceChainId: evm.sourceChainId,
    destinationDomain: plan.destinationDomain,
    minFinalityThreshold: plan.minFinalityThreshold,
    amountUsdc: evmAtomicUsdcToDecimal(amount),
    maxFeeUsdc: evmAtomicUsdcToDecimal(maxFee),
    expectedStellarAtomicAmount: plan.expectedStellarAtomicAmount.toString(),
    minimumStellarAtomicAmountAfterMaxFee:
      plan.minimumStellarAtomicAmountAfterMaxFee.toString(),
    cctpForwarder,
    audit: plan.audit,
  }
}
