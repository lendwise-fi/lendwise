import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'

import {
  assertStellarCctpMintAndForwardTransaction,
  buildChangeTrustTransactionXdr,
  prepareStellarCctpMintAndForward,
  stellarUsdcAsset,
  trustlineStatusFromBalances,
} from '..'

function contract(seed: number): string {
  return StrKey.encodeContract(Buffer.alloc(32, seed))
}

function customMintTx({
  forwarder,
  args,
  source = Keypair.random().publicKey(),
}: {
  forwarder: string
  args: xdr.ScVal[]
  source?: string
}) {
  const operation = new Contract(forwarder).call('mint_and_forward', ...args)
  return new TransactionBuilder(new Account(source, '1'), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(300)
    .build()
}

function mintTx({
  forwarder,
  source = Keypair.random().publicKey(),
}: {
  forwarder: string
  source?: string
}) {
  const operation = new Contract(forwarder).call(
    'mint_and_forward',
    xdr.ScVal.scvBytes(Buffer.from('1234', 'hex')),
    xdr.ScVal.scvBytes(Buffer.from('abcd', 'hex'))
  )
  return new TransactionBuilder(new Account(source, '1'), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(300)
    .build()
}

describe('Stellar CCTP helpers', () => {
  it('builds a CctpForwarder mint_and_forward operation', () => {
    const plan = prepareStellarCctpMintAndForward({
      source: Keypair.random().publicKey(),
      networkPassphrase: Networks.TESTNET,
      cctpForwarder: contract(4),
      message: '0x1234',
      attestation: '0xabcd',
    })
    const operation = xdr.Operation.fromXDR(plan.operationXdr, 'base64')

    expect(plan.kind).toBe('stellarSoroban')
    expect(operation.body().switch().name).toBe('invokeHostFunction')
  })

  it('validates the prepared mint transaction target and function before relay', () => {
    const forwarder = contract(4)
    expect(() =>
      assertStellarCctpMintAndForwardTransaction({
        transaction: mintTx({ forwarder }),
        cctpForwarder: forwarder,
      })
    ).not.toThrow()

    expect(() =>
      assertStellarCctpMintAndForwardTransaction({
        transaction: mintTx({ forwarder: contract(5) }),
        cctpForwarder: forwarder,
      })
    ).toThrow(/not the configured CCTP forwarder/)
  })

  it('rejects mint relay transactions with non-byte message args', () => {
    const forwarder = contract(4)
    const transaction = customMintTx({
      forwarder,
      args: [
        xdr.ScVal.scvString('not-bytes'),
        xdr.ScVal.scvBytes(Buffer.from('abcd', 'hex')),
      ],
    })

    expect(() =>
      assertStellarCctpMintAndForwardTransaction({
        transaction,
        cctpForwarder: forwarder,
      })
    ).toThrow(/must be Soroban bytes/)
  })

  it('detects a missing USDC trustline from Horizon balances', () => {
    const address = Keypair.random().publicKey()
    const asset = stellarUsdcAsset('testnet')
    const status = trustlineStatusFromBalances({
      address,
      asset,
      balances: [
        {
          asset_type: 'native',
          balance: '10.0000000',
          buying_liabilities: '0.0000000',
          selling_liabilities: '0.0000000',
        },
      ],
    })

    expect(status.exists).toBe(false)
  })

  it('detects an existing USDC trustline and builds ChangeTrust XDR', () => {
    const source = Keypair.random().publicKey()
    const asset = stellarUsdcAsset('testnet')
    const status = trustlineStatusFromBalances({
      address: source,
      asset,
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: asset.issuer,
          balance: '0.0000000',
          limit: '922337203685.4775807',
          buying_liabilities: '0.0000000',
          selling_liabilities: '0.0000000',
          is_authorized: true,
          is_authorized_to_maintain_liabilities: true,
          is_clawback_enabled: false,
          last_modified_ledger: 1,
        },
      ],
    })
    const xdrEnvelope = buildChangeTrustTransactionXdr({
      source,
      networkPassphrase: Networks.TESTNET,
      accountSequence: '1',
      asset,
    })
    const txEnvelope = xdr.TransactionEnvelope.fromXDR(xdrEnvelope, 'base64')

    expect(status.exists).toBe(true)
    expect(status.balance).toBe('0.0000000')
    expect(txEnvelope.v1().tx().operations()[0].body().switch().name).toBe(
      'changeTrust'
    )
  })
})
