import { beforeEach, describe, expect, it, vi } from 'vitest'

const memory = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
})

const { useWalletStore } = await import('./walletStore')
type Wallet = ReturnType<typeof useWalletStore.getState>['wallets'][number]

const SOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const EVM = '0x52908400098527886E0F7030069857D2E4169EE7'
const G = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'

function wallet(address: string, chainFamily: Wallet['chainFamily']): Wallet {
  return {
    address,
    name: '',
    ens: null,
    walletType: null,
    smartContractWalletType: null,
    isActive: false,
    isConnected: true,
    isCurrentlyConnected: true,
    chainFamily,
    avatarUri: '',
    roles: [],
    isUpdating: false,
  }
}

beforeEach(() => {
  useWalletStore.setState({ wallets: [], hiddenAddresses: new Set() })
})

describe('walletStore addresses', () => {
  it('dedupes EVM addresses whatever their case', () => {
    const s = useWalletStore.getState()
    s.addWallet(wallet(EVM, 'evm'))
    s.addWallet(wallet(EVM.toLowerCase(), 'evm'))
    s.addWallets([wallet(EVM.toUpperCase().replace('0X', '0x'), 'evm')])
    expect(useWalletStore.getState().wallets).toHaveLength(1)
    expect(useWalletStore.getState().hasWallet(EVM.toLowerCase())).toBe(true)
  })

  it('keeps Solana addresses as given and matches them case-sensitively', () => {
    const s = useWalletStore.getState()
    s.addWallet(wallet(SOL, 'solana'))
    expect(useWalletStore.getState().wallets[0].address).toBe(SOL)
    expect(useWalletStore.getState().hasWallet(SOL)).toBe(true)
    expect(useWalletStore.getState().hasWallet(SOL.toLowerCase())).toBe(false)
    s.addWallet(wallet(SOL.toLowerCase(), 'solana'))
    expect(useWalletStore.getState().wallets).toHaveLength(2)
  })

  it('updates and removes a Solana wallet by its exact address', () => {
    const s = useWalletStore.getState()
    s.addWallet(wallet(SOL, 'solana'))
    s.updateWallet(SOL, { name: 'Phantom' })
    expect(useWalletStore.getState().wallets[0].name).toBe('Phantom')
    s.removeWallet(SOL.toLowerCase())
    expect(useWalletStore.getState().wallets).toHaveLength(1)
    s.removeWallet(SOL)
    expect(useWalletStore.getState().wallets).toHaveLength(0)
  })

  it('hides EVM addresses case-insensitively and Solana ones exactly', () => {
    const s = useWalletStore.getState()
    s.hideAddress(EVM)
    s.hideAddress(SOL, 'solana')
    const st = useWalletStore.getState()
    expect(st.isHidden(EVM.toLowerCase())).toBe(true)
    expect(st.isHidden(SOL, 'solana')).toBe(true)
    expect(st.isHidden(SOL.toLowerCase(), 'solana')).toBe(false)
    st.unhideAddress(SOL, 'solana')
    expect(useWalletStore.getState().isHidden(SOL, 'solana')).toBe(false)
  })

  it('matches a stored Stellar wallet by its exact address', () => {
    const s = useWalletStore.getState()
    s.addWallet(wallet(G, 'stellar'))
    s.addWallet(wallet(G, 'stellar'))
    expect(useWalletStore.getState().wallets).toHaveLength(1)
    expect(useWalletStore.getState().hasWallet(G)).toBe(true)
  })
})
