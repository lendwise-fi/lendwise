import { fetchMorphoV1Apy } from '@/lib/protocols/morpho/v1/apy-spot'

async function main() {
  // You can change these values to test different chains and tokens
  const chainToTest = 'ethereum'
  const tokenToTest = 'WETH'

  console.log(`Fetching Morpho V1 APY for chain: ${chainToTest}...`)

  try {
    const snapshots = await fetchMorphoV1Apy(chainToTest)

    console.log(
      `Fetched ${snapshots.length} total snapshots for ${chainToTest}.`
    )

    // Filter exactly for the specific token, checking the market label (e.g. "WSTETH/WETH" or "USDC/NONE")
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
    console.error('Failed to fetch Morpho V1 APY:', error)
  }
}

main().catch(console.error)
