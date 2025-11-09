/**
 * Test script to verify automatic chain registration
 */
import { COMPOUND_CONFIG } from './src/lib/adapters/compound/config'

console.log('Testing automatic chain registration...\n')

// Show all chains with clientPath
const chainsWithClientPath = Object.entries(COMPOUND_CONFIG.compound_v3.chains)
  .filter(([_, chainConfig]) => chainConfig.custom?.clientPath)
  .map(([_, chainConfig]) => ({
    chainId: chainConfig.id,
    chainName: chainConfig.name,
    clientPath: chainConfig.custom.clientPath,
    subgraphUrl: chainConfig.custom.subgraphUrl,
  }))

console.log('Chains configured for automatic registration:')
chainsWithClientPath.forEach(chain => {
  console.log(`  - ${chain.chainName} (ID: ${chain.chainId})`)
  console.log(`    Client Path: ${chain.clientPath}`)
  console.log(`    Subgraph: ${chain.subgraphUrl?.substring(0, 50)}...`)
  console.log()
})

console.log(`Total chains to be registered: ${chainsWithClientPath.length}`)
