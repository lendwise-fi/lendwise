export function getNetworkName(chainName: string): string {
  if (chainName === 'Ethereum') {
    return chainName.replace('AaveV3Ethereum', '').toLowerCase()
  } else if (chainName === 'BSC') {
    return 'bsc'
  } else {
    return chainName.replace('AaveV3', '').toLowerCase()
  }
}
