const EVM_USDC_DECIMALS = 6n
const STELLAR_USDC_DECIMALS = 7n
const STELLAR_TO_EVM_SCALE = 10n ** (STELLAR_USDC_DECIMALS - EVM_USDC_DECIMALS)

function assertAtomicAmount(value: bigint, label: string) {
  if (value <= 0n) {
    throw new Error(`${label} must be positive`)
  }
}

export function evmUsdcToStellarUsdcAtomic(evmAtomicAmount: bigint): bigint {
  assertAtomicAmount(evmAtomicAmount, 'EVM USDC amount')
  return evmAtomicAmount * STELLAR_TO_EVM_SCALE
}

export function stellarUsdcToEvmUsdcAtomic(
  stellarAtomicAmount: bigint
): bigint {
  assertAtomicAmount(stellarAtomicAmount, 'Stellar USDC amount')
  if (stellarAtomicAmount % STELLAR_TO_EVM_SCALE !== 0n) {
    throw new Error(
      'Stellar USDC amount cannot be represented exactly with EVM USDC decimals'
    )
  }
  return stellarAtomicAmount / STELLAR_TO_EVM_SCALE
}

export function decimalUsdcToEvmAtomic(value: string): bigint {
  const [whole, fraction = ''] = value.trim().split('.')
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) {
    throw new Error('USDC amount must be a positive decimal string')
  }
  if (fraction.length > Number(EVM_USDC_DECIMALS)) {
    throw new Error('EVM USDC amount supports at most 6 decimals')
  }

  const paddedFraction = fraction.padEnd(Number(EVM_USDC_DECIMALS), '0')
  const atomic = BigInt(whole) * 1_000_000n + BigInt(paddedFraction || '0')
  assertAtomicAmount(atomic, 'EVM USDC amount')
  return atomic
}

export function evmAtomicUsdcToDecimal(value: bigint): string {
  const whole = value / 1_000_000n
  const fraction = (value % 1_000_000n).toString().padStart(6, '0')
  return `${whole}.${fraction}`.replace(/\.?0+$/, '')
}
