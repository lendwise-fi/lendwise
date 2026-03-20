export interface Protocol {
  name: string
  blockchain:
    | 'ethereum'
    | 'polygon'
    | 'arbitrum'
    | 'optimism'
    | 'avalanche'
    | 'bsc'
  tvl: number
  category: 'supplying' | 'dex' | 'yield_farming' | 'derivatives'
  risk_score: number
  audit_status: 'audited' | 'partially_audited' | 'unaudited'
  logo_url?: string
}

const mockProtocols: Protocol[] = [
  {
    name: 'Aave V3',
    blockchain: 'ethereum',
    tvl: 5200000000,
    category: 'supplying',
    risk_score: 2,
    audit_status: 'audited',
  },
  {
    name: 'Compound V3',
    blockchain: 'ethereum',
    tvl: 3100000000,
    category: 'supplying',
    risk_score: 2,
    audit_status: 'audited',
  },
  {
    name: 'Morpho Blue',
    blockchain: 'ethereum',
    tvl: 850000000,
    category: 'supplying',
    risk_score: 3,
    audit_status: 'audited',
  },
  {
    name: 'Radiant Capital',
    blockchain: 'arbitrum',
    tvl: 450000000,
    category: 'supplying',
    risk_score: 5,
    audit_status: 'audited',
  },
]

export const Protocol = {
  async list(): Promise<Protocol[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([...mockProtocols])
      }, 300)
    })
  },

  async get(name: string): Promise<Protocol | null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const protocol = mockProtocols.find((p) => p.name === name)
        resolve(protocol || null)
      }, 300)
    })
  },
}
