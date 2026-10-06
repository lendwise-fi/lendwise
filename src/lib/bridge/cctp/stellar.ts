import {
  Account,
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Networks,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk'

import { type CctpEnvironment, STELLAR_CCTP_CONTRACTS } from './config'

export interface StellarCctpMintAndForwardInput {
  source: string
  networkPassphrase: string
  cctpForwarder: string
  message: `0x${string}` | string
  attestation: `0x${string}` | string
}

export interface StellarSorobanOperationPlan {
  kind: 'stellarSoroban'
  operationXdr: string
  source: string
  networkPassphrase: string
  description: string
}

export interface StellarTrustlineAsset {
  code: string
  issuer: string
}

export interface StellarTrustlineStatus {
  address: string
  asset: StellarTrustlineAsset
  exists: boolean
  balance?: string
  limit?: string
}

export interface BuildChangeTrustXdrInput {
  source: string
  networkPassphrase: string
  accountSequence: string
  asset: StellarTrustlineAsset
  baseFee?: string
  timeoutSeconds?: number
}

export interface LoadTrustlineStatusInput {
  address: string
  asset: StellarTrustlineAsset
  horizonUrl?: string
}

export const STELLAR_USDC_ISSUER = {
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
} as const

function assertStellarAccount(value: string): void {
  if (!StrKey.isValidEd25519PublicKey(value)) {
    throw new Error('source must be a Stellar G account')
  }
}

function assertStellarContract(value: string, label: string): void {
  if (!StrKey.isValidContract(value)) {
    throw new Error(`${label} must be a Stellar contract strkey`)
  }
}

function hexToBytes(value: string, label: string): Buffer {
  const normalized = value.startsWith('0x') ? value.slice(2) : value
  if (!/^[0-9a-fA-F]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be an even-length hex string`)
  }
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return Buffer.from(normalized, 'hex')
}

function assertNonEmptyBytesScVal(value: unknown, label: string): void {
  const scVal = value as {
    switch?: () => { name: string }
    bytes?: () => Uint8Array | Buffer
  }
  if (scVal.switch?.().name !== 'scvBytes') {
    throw new Error(`${label} must be Soroban bytes`)
  }
  const bytes = scVal.bytes?.()
  if (!bytes || bytes.length === 0) {
    throw new Error(`${label} must be non-empty Soroban bytes`)
  }
}

function defaultHorizonUrl(networkPassphrase: string): string {
  return networkPassphrase === Networks.PUBLIC
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org'
}

export function stellarUsdcAsset(
  environment: CctpEnvironment
): StellarTrustlineAsset {
  return {
    code: 'USDC',
    issuer: STELLAR_USDC_ISSUER[environment],
  }
}

export function prepareStellarCctpMintAndForward(
  input: StellarCctpMintAndForwardInput
): StellarSorobanOperationPlan {
  assertStellarAccount(input.source)
  assertStellarContract(input.cctpForwarder, 'CCTP forwarder')

  const operation = new Contract(input.cctpForwarder).call(
    'mint_and_forward',
    xdr.ScVal.scvBytes(hexToBytes(input.message, 'CCTP message')),
    xdr.ScVal.scvBytes(hexToBytes(input.attestation, 'CCTP attestation'))
  )

  return {
    kind: 'stellarSoroban',
    operationXdr: operation.toXDR('base64'),
    source: input.source,
    networkPassphrase: input.networkPassphrase,
    description: 'CCTP mint USDC on Stellar and forward to hook recipient',
  }
}

export function buildChangeTrustTransactionXdr(
  input: BuildChangeTrustXdrInput
): string {
  assertStellarAccount(input.source)
  assertStellarAccount(input.asset.issuer)

  const account = new Account(input.source, input.accountSequence)
  const asset = new Asset(input.asset.code, input.asset.issuer)
  return new TransactionBuilder(account, {
    fee: input.baseFee ?? BASE_FEE,
    networkPassphrase: input.networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(input.timeoutSeconds ?? 300)
    .build()
    .toXDR()
}

export function trustlineStatusFromBalances({
  address,
  asset,
  balances,
}: {
  address: string
  asset: StellarTrustlineAsset
  balances: Horizon.HorizonApi.BalanceLine[]
}): StellarTrustlineStatus {
  const line = balances.find(
    (balance) =>
      'asset_code' in balance &&
      balance.asset_code === asset.code &&
      balance.asset_issuer === asset.issuer
  )

  const trustline = line as { balance?: string; limit?: string } | undefined

  return {
    address,
    asset,
    exists: Boolean(line),
    balance: trustline?.balance,
    limit: trustline?.limit,
  }
}

export async function loadTrustlineStatus(
  input: LoadTrustlineStatusInput
): Promise<StellarTrustlineStatus> {
  assertStellarAccount(input.address)
  assertStellarAccount(input.asset.issuer)
  const server = new Horizon.Server(
    input.horizonUrl ?? defaultHorizonUrl(Networks.TESTNET)
  )
  const account = await server.loadAccount(input.address)
  return trustlineStatusFromBalances({
    address: input.address,
    asset: input.asset,
    balances: account.balances,
  })
}

export function assertStellarCctpMintAndForwardTransaction({
  transaction,
  cctpForwarder,
}: {
  transaction: Transaction
  cctpForwarder: string
}): void {
  assertStellarContract(cctpForwarder, 'CCTP forwarder')
  if (transaction.operations.length !== 1) {
    throw new Error(
      'Stellar bridge transaction must contain exactly one operation'
    )
  }

  const operation = transaction.operations[0] as {
    type?: string
    func?: {
      invokeContract?: () => {
        contractAddress: () => {
          switch: () => { name: string }
          contractId: () => Uint8Array
        }
        functionName: () => string
        args: () => unknown[]
      }
    }
  }

  if (
    operation.type !== 'invokeHostFunction' ||
    !operation.func?.invokeContract
  ) {
    throw new Error('Stellar bridge transaction must invoke a Soroban contract')
  }

  const invoke = operation.func.invokeContract()
  if (invoke.functionName() !== 'mint_and_forward') {
    throw new Error('Stellar bridge transaction must call mint_and_forward')
  }

  const address = invoke.contractAddress()
  if (address.switch().name !== 'scAddressTypeContract') {
    throw new Error('Stellar bridge transaction target must be a contract')
  }

  const expected = Buffer.from(StrKey.decodeContract(cctpForwarder)).toString(
    'hex'
  )
  const actual = Buffer.from(address.contractId()).toString('hex')
  if (actual !== expected) {
    throw new Error(
      'Stellar bridge transaction target is not the configured CCTP forwarder'
    )
  }

  const args = invoke.args()
  if (args.length !== 2) {
    throw new Error(
      'Stellar bridge transaction must pass message and attestation bytes'
    )
  }
  assertNonEmptyBytesScVal(args[0], 'CCTP message')
  assertNonEmptyBytesScVal(args[1], 'CCTP attestation')
}

export function resolveStellarCctpForwarder(
  environment: CctpEnvironment,
  override?: string
): string {
  return override?.trim() || STELLAR_CCTP_CONTRACTS[environment].cctpForwarder
}
