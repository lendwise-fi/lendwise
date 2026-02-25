import { fetchAaveV3Apy } from '@/lib/protocols/aave/v3/apy-spot'

async function main() {
  // You can change these values to test different chains and tokens
  const chainToTest = 'base' // e.g., 'ethereum', 'arbitrum', 'polygon'
  const tokenToTest = 'USDC'

  console.log(`Fetching Aave V3 APY for chain: ${chainToTest}...`)

  try {
    const snapshots = await fetchAaveV3Apy(chainToTest)

    console.log(
      `Fetched ${snapshots.length} total snapshots for ${chainToTest}.`
    )

    // Filter exactly for the specific token by checking the vault symbol
    const tokenSnapshots = snapshots.filter((s) => {
      const vaultSymbol = s.metadata.vault.symbol.toUpperCase()
      const searchToken = tokenToTest.toUpperCase()
      return vaultSymbol.includes(searchToken)
    })

    if (tokenSnapshots.length === 0) {
      console.log(`\nNo snapshots found containing token '${tokenToTest}'.`)
    } else {
      console.log(
        `\nFound ${tokenSnapshots.length} snapshot(s) containing '${tokenToTest}':`
      )
      console.log(JSON.stringify(tokenSnapshots, null, 2))
    }
  } catch (error) {
    console.error('Failed to fetch Aave V3 APY:', error)
  }
}

main().catch(console.error)
