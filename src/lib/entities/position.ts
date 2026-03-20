export interface Position {
  protocol: string
  blockchain:
    | 'ethereum'
    | 'polygon'
    | 'arbitrum'
    | 'optimism'
    | 'avalanche'
    | 'bsc'
  position_type: 'supplying' | 'borrowing'
  asset: string
  amount: number
  usd_value: number
  apy: number
  health_factor?: number
  collateral_ratio?: number
  liquidation_price?: number
  is_active?: boolean
}

// Mock data for development
const mockPositions: Position[] = [
  {
    protocol: 'Aave V3',
    blockchain: 'ethereum',
    position_type: 'supplying',
    asset: 'USDC',
    amount: 50000,
    usd_value: 50000,
    apy: 4.25,
    is_active: true,
  },
  {
    protocol: 'Compound V3',
    blockchain: 'ethereum',
    position_type: 'supplying',
    asset: 'ETH',
    amount: 15,
    usd_value: 37500,
    apy: 3.8,
    is_active: true,
  },
  {
    protocol: 'Aave V3',
    blockchain: 'ethereum',
    position_type: 'borrowing',
    asset: 'USDT',
    amount: 20000,
    usd_value: 20000,
    apy: 3.2,
    health_factor: 2.4,
    collateral_ratio: 75,
    liquidation_price: 1800,
    is_active: true,
  },
  {
    protocol: 'Morpho Blue',
    blockchain: 'ethereum',
    position_type: 'borrowing',
    asset: 'USDC',
    amount: 15000,
    usd_value: 15000,
    apy: 2.5,
    health_factor: 3.1,
    collateral_ratio: 80,
    liquidation_price: 1650,
    is_active: true,
  },
]

export const Position = {
  async list(sortBy?: string): Promise<Position[]> {
    // Mock API call - replace with actual API
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([...mockPositions])
      }, 300)
    })
  },

  async get(id: string): Promise<Position | null> {
    // Mock API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockPositions[0] || null)
      }, 300)
    })
  },

  async create(data: Partial<Position>): Promise<Position> {
    // Mock API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(data as Position)
      }, 300)
    })
  },
}
