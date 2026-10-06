'use client'

import { useMemo, useState, useTransition } from 'react'

import { waitForTransactionReceipt } from '@wagmi/core'
import {
  CheckCircle2,
  CircleAlert,
  CircleDot,
  Loader2,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Hash } from 'viem'
import { useAccount, useConfig, useWriteContract } from 'wagmi'

import {
  type BridgeTrustlineResponse,
  type SerializedEvmCctpBurnPlan,
  buildStellarUsdcChangeTrustXdr,
  checkStellarUsdcTrustline,
  prepareEvmToStellarBridgeBurn,
  prepareStellarMintAndForwardTransaction,
  recordCctpBridgeAuditEvent,
  submitSignedStellarBridgeTransaction,
  submitSignedStellarUsdcChangeTrustTransaction,
  waitForCctpAttestation,
} from '@/app/actions'
import {
  type CctpEvmChainSlug,
  cctpTokenMessengerV2Abi,
  erc20BridgeApprovalAbi,
} from '@/lib/bridge/cctp'
import { useWalletStore } from '@/stores/walletStore'

import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

type StepStatus = 'idle' | 'active' | 'done' | 'failed'

type StellarWalletsKitApi = {
  signTransaction?: (
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string }
  ) => Promise<
    string | { signedTxXdr?: string; signedXDR?: string; xdr?: string }
  >
  sign?: (p: {
    xdr: string
    networkPassphrase?: string
    address?: string
  }) => Promise<
    string | { signedTxXdr?: string; signedXDR?: string; xdr?: string }
  >
}

const SOURCE_CHAINS: CctpEvmChainSlug[] = [
  'base',
  'ethereum',
  'arbitrum',
  'optimism',
  'polygon',
  'avalanche',
]

function signedXdrFromResult(
  result: string | { signedTxXdr?: string; signedXDR?: string; xdr?: string }
): string {
  if (typeof result === 'string') return result
  const signed = result.signedTxXdr ?? result.signedXDR ?? result.xdr
  if (!signed) throw new Error('Wallet did not return a signed transaction')
  return signed
}

async function signStellarTransaction({
  address,
  networkPassphrase,
  transactionXdr,
}: {
  address: string
  networkPassphrase: string
  transactionXdr: string
}) {
  const { StellarWalletsKit } = await import('@creit-tech/stellar-wallets-kit')
  const kit = StellarWalletsKit as StellarWalletsKitApi
  if (kit.signTransaction) {
    return signedXdrFromResult(
      await kit.signTransaction(transactionXdr, { address, networkPassphrase })
    )
  }
  if (kit.sign) {
    return signedXdrFromResult(
      await kit.sign({ xdr: transactionXdr, address, networkPassphrase })
    )
  }
  throw new Error(
    'Selected Stellar wallet does not support transaction signing'
  )
}

function stepIcon(status: StepStatus) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4" />
  if (status === 'failed') return <CircleAlert className="h-4 w-4" />
  if (status === 'active') return <Loader2 className="h-4 w-4 animate-spin" />
  return <CircleDot className="h-4 w-4" />
}

export function BridgeUsdcToStellar({
  initialAmount,
  initialAsset,
  initialSource,
}: {
  initialAmount?: string
  initialAsset?: string
  initialSource?: string
}) {
  const { address: evmAddress, isConnected: evmConnected } = useAccount()
  const stellarWallet = useWalletStore((state) =>
    state.wallets.find(
      (wallet) => wallet.chainFamily === 'stellar' && wallet.isConnected
    )
  )
  const config = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [isPending, startTransition] = useTransition()
  const [isRunning, setIsRunning] = useState(false)
  const initialSourceChain = SOURCE_CHAINS.includes(
    initialSource as CctpEvmChainSlug
  )
    ? (initialSource as CctpEvmChainSlug)
    : 'base'
  const [sourceChain, setSourceChain] =
    useState<CctpEvmChainSlug>(initialSourceChain)
  const [amount, setAmount] = useState(initialAmount ?? '')
  const [trustline, setTrustline] = useState<BridgeTrustlineResponse | null>(
    null
  )
  const [burnPlan, setBurnPlan] = useState<SerializedEvmCctpBurnPlan | null>(
    null
  )
  const [approvalHash, setApprovalHash] = useState<Hash | null>(null)
  const [burnHash, setBurnHash] = useState<Hash | null>(null)
  const [mintHash, setMintHash] = useState<string | null>(null)
  const [attestationNonce, setAttestationNonce] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<Record<string, StepStatus>>({
    trustline: 'idle',
    approval: 'idle',
    burn: 'idle',
    attestation: 'idle',
    mint: 'idle',
  })

  const asset = (initialAsset ?? 'USDC').toUpperCase()
  const canRun =
    asset === 'USDC' &&
    evmConnected &&
    evmAddress &&
    stellarWallet?.address &&
    Number(amount) > 0

  const orderedSteps = useMemo(
    () => [
      ['trustline', 'USDC trustline'] as const,
      ['approval', 'USDC approval'] as const,
      ['burn', 'EVM burn'] as const,
      ['attestation', 'Iris attestation'] as const,
      ['mint', 'Stellar mint'] as const,
    ],
    []
  )

  function updateStep(step: keyof typeof steps, status: StepStatus) {
    setSteps((current) => ({ ...current, [step]: status }))
  }

  async function ensureTrustline(stellarAddress: string) {
    updateStep('trustline', 'active')
    const status = await checkStellarUsdcTrustline(stellarAddress)
    setTrustline(status)
    if (!status.changeTrustRequired) {
      await recordCctpBridgeAuditEvent({
        stage: 'trustline_checked',
        stellarRecipient: stellarAddress,
      })
      updateStep('trustline', 'done')
      return
    }

    const changeTrust = await buildStellarUsdcChangeTrustXdr(stellarAddress)
    const signedXdr = await signStellarTransaction({
      address: stellarAddress,
      networkPassphrase: changeTrust.networkPassphrase,
      transactionXdr: changeTrust.transactionXdr,
    })
    await submitSignedStellarUsdcChangeTrustTransaction(signedXdr)
    await recordCctpBridgeAuditEvent({
      stage: 'change_trust_submitted',
      stellarRecipient: stellarAddress,
    })
    const refreshed = await checkStellarUsdcTrustline(stellarAddress)
    setTrustline(refreshed)
    if (refreshed.changeTrustRequired) {
      throw new Error('USDC trustline is still missing after ChangeTrust')
    }
    updateStep('trustline', 'done')
  }

  async function runBridge() {
    if (!canRun || !stellarWallet?.address) return
    setIsRunning(true)
    setError(null)
    setApprovalHash(null)
    setBurnHash(null)
    setMintHash(null)
    setAttestationNonce(null)
    setSteps({
      trustline: 'idle',
      approval: 'idle',
      burn: 'idle',
      attestation: 'idle',
      mint: 'idle',
    })

    try {
      await ensureTrustline(stellarWallet.address)

      const plan = await prepareEvmToStellarBridgeBurn({
        sourceChain,
        amountUsdc: amount,
        stellarRecipient: stellarWallet.address,
        finality: 'fast',
      })
      setBurnPlan(plan)

      updateStep('approval', 'active')
      const approvalTxHash = await writeContractAsync({
        address: plan.args[3],
        abi: erc20BridgeApprovalAbi,
        functionName: 'approve',
        args: [plan.to, BigInt(plan.args[0])],
        chainId: plan.sourceChainId,
      })
      setApprovalHash(approvalTxHash)
      await recordCctpBridgeAuditEvent({
        stage: 'usdc_approval_submitted',
        sourceChain,
        sourceDomain: plan.sourceDomain,
        sourceChainId: plan.sourceChainId,
        evmTxHash: approvalTxHash,
        stellarRecipient: stellarWallet.address,
        amountUsdc: plan.amountUsdc,
      })
      await waitForTransactionReceipt(config, {
        hash: approvalTxHash,
        chainId: plan.sourceChainId,
      })
      updateStep('approval', 'done')

      updateStep('burn', 'active')
      const txHash = await writeContractAsync({
        address: plan.to,
        chainId: plan.sourceChainId,
        abi: cctpTokenMessengerV2Abi,
        functionName: 'depositForBurnWithHook',
        args: [
          BigInt(plan.args[0]),
          plan.args[1],
          plan.args[2] as `0x${string}`,
          plan.args[3],
          plan.args[4] as `0x${string}`,
          BigInt(plan.args[5]),
          plan.args[6],
          plan.args[7] as `0x${string}`,
        ],
      })
      setBurnHash(txHash)
      await recordCctpBridgeAuditEvent({
        stage: 'burn_submitted',
        sourceChain,
        sourceDomain: plan.sourceDomain,
        sourceChainId: plan.sourceChainId,
        evmTxHash: txHash,
        stellarRecipient: stellarWallet.address,
        cctpForwarder: plan.cctpForwarder,
        amountUsdc: plan.amountUsdc,
      })
      await waitForTransactionReceipt(config, {
        hash: txHash,
        chainId: plan.sourceChainId,
      })
      updateStep('burn', 'done')

      updateStep('attestation', 'active')
      const attestation = await waitForCctpAttestation({
        sourceDomainId: plan.sourceDomain,
        transactionHash: txHash,
        expectedMessage: {
          destinationDomain: plan.destinationDomain,
          recipient: plan.args[2],
          destinationCaller: plan.args[4],
          minFinalityThreshold: plan.minFinalityThreshold,
        },
      })
      setAttestationNonce(attestation.eventNonce ?? attestation.nonce ?? null)
      await recordCctpBridgeAuditEvent({
        stage: 'attestation_ready',
        sourceChain,
        sourceDomain: plan.sourceDomain,
        evmTxHash: txHash,
        irisNonce: attestation.eventNonce ?? attestation.nonce,
      })
      updateStep('attestation', 'done')

      updateStep('mint', 'active')
      const preparedMint = await prepareStellarMintAndForwardTransaction({
        source: stellarWallet.address,
        message: attestation.message,
        attestation: attestation.attestation,
      })
      const signedMintXdr = await signStellarTransaction({
        address: stellarWallet.address,
        networkPassphrase: preparedMint.networkPassphrase,
        transactionXdr: preparedMint.transactionXdr,
      })
      const submitted =
        await submitSignedStellarBridgeTransaction(signedMintXdr)
      setMintHash(submitted.hash)
      await recordCctpBridgeAuditEvent({
        stage: 'mint_submitted',
        sourceChain,
        sourceDomain: plan.sourceDomain,
        evmTxHash: txHash,
        stellarTxHash: submitted.hash,
        stellarRecipient: stellarWallet.address,
        cctpForwarder: plan.cctpForwarder,
        amountUsdc: plan.amountUsdc,
      })
      updateStep('mint', 'done')
      toast.success('USDC minted on Stellar')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setSteps((current) => {
        const next = { ...current }
        for (const key of Object.keys(next)) {
          if (next[key] === 'active') next[key] = 'failed'
        }
        return next
      })
      toast.error(message)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-normal">
            Bridge USDC to Stellar
          </h1>
          <Badge variant="outline">CCTP V2</Badge>
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Burn native EVM USDC, wait for Circle Iris, then mint native Stellar
          USDC through the configured CctpForwarder.
        </p>
      </div>

      <div className="border-border bg-card grid gap-5 rounded-lg border p-5 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="source-chain">Source chain</Label>
            <Select
              value={sourceChain}
              onValueChange={(value) =>
                setSourceChain(value as CctpEvmChainSlug)
              }
            >
              <SelectTrigger id="source-chain">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_CHAINS.map((chain) => (
                  <SelectItem key={chain} value={chain}>
                    {chain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="10.00"
            />
          </div>

          <div className="space-y-2">
            <Label>EVM wallet</Label>
            <div className="border-input bg-background flex h-9 items-center rounded-md border px-3 font-mono text-xs">
              {evmAddress ?? 'Not connected'}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Stellar wallet</Label>
            <div className="border-input bg-background flex h-9 items-center rounded-md border px-3 font-mono text-xs">
              {stellarWallet?.address ?? 'Not connected'}
            </div>
          </div>

          <div className="sm:col-span-2">
            <Button
              className="w-full sm:w-auto"
              disabled={!canRun || isPending || isRunning}
              onClick={() => startTransition(runBridge)}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Start bridge
            </Button>
          </div>
        </div>

        <div className="border-border flex flex-col gap-3 rounded-md border p-4">
          {orderedSteps.map(([id, label]) => (
            <div key={id} className="flex items-center gap-2 text-sm">
              <span
                className={
                  steps[id] === 'done'
                    ? 'text-emerald-600'
                    : steps[id] === 'failed'
                      ? 'text-red-600'
                      : 'text-muted-foreground'
                }
              >
                {stepIcon(steps[id])}
              </span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 text-sm">
        {trustline && (
          <div className="border-border rounded-md border p-3">
            Trustline: {trustline.exists ? 'ready' : 'missing'} (
            {trustline.asset.code})
          </div>
        )}
        {burnPlan && (
          <div className="border-border rounded-md border p-3">
            Forwarder:{' '}
            <span className="font-mono">{burnPlan.cctpForwarder}</span>
          </div>
        )}
        {approvalHash && (
          <div className="border-border rounded-md border p-3">
            Approval hash: <span className="font-mono">{approvalHash}</span>
          </div>
        )}
        {burnHash && (
          <div className="border-border rounded-md border p-3">
            Burn hash: <span className="font-mono">{burnHash}</span>
          </div>
        )}
        {attestationNonce && (
          <div className="border-border rounded-md border p-3">
            Iris nonce: <span className="font-mono">{attestationNonce}</span>
          </div>
        )}
        {mintHash && (
          <div className="border-border rounded-md border p-3">
            Stellar mint hash: <span className="font-mono">{mintHash}</span>
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-700 dark:bg-red-950/30">
            {error}
          </div>
        )}
      </div>
    </section>
  )
}
