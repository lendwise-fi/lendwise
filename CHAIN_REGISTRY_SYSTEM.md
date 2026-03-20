# Système d'Enregistrement de Chaînes avec Queries et Transformers Spécifiques

## Vue d'ensemble

Ce document décrit l'architecture du système d'enregistrement de chaînes (chains) pour les adaptateurs de protocoles, permettant de gérer des schémas de subgraph différents selon les chaînes blockchain. Le système est conçu pour être flexible et extensible, permettant à chaque chaîne d'avoir ses propres requêtes GraphQL et transformateurs de données lorsque nécessaire.

## Problématique

Les protocoles DeFi comme Compound V3 déploient leurs contrats sur plusieurs chaînes (Ethereum, Arbitrum, Optimism, etc.). Cependant, les subgraphs qui exposent les données peuvent avoir des schémas différents selon :

- Le fournisseur du subgraph (Messari, Spencer.papercliplabs.eth, etc.)
- La version du protocole sur une chaîne spécifique
- Les différences d'implémentation selon les chaînes

## Architecture du Système

### 1. Registre de Chaînes (Chain Registry)

Le système utilise un registre centralisé pour gérer les clients par chaîne :

```typescript
// src/lib/protocols/compound/v3/onchain/index.ts
const chainRegistry = createChainRegistry<ChainClient>(
  () => COMPOUND_CONFIG.compound_v3.chains,
  { protocolName: 'Compound V3' }
)
```

### 2. Types de Configuration

#### ChainQueries
Définit les requêtes GraphQL spécifiques à une chaîne :

```typescript
export type ChainQueries = {
  USER_LEND_POSITIONS: typeof USER_LEND_POSITIONS
  USER_BORROW_POSITIONS: typeof USER_BORROW_POSITIONS
}
```

#### ChainTransformers
Définit les fonctions de transformation de données spécifiques à une chaîne :

```typescript
export type ChainTransformers = {
  getUserSupplyPositions?: (
    data: unknown,
    protocolId: string
  ) => SupplyPosition[]
  getUserBorrowPositions?: (
    data: unknown,
    protocolId: string
  ) => BorrowPosition[]
  getMarketBorrowHistoryRates?: (
    data: unknown,
    protocolId: string
  ) => MarketRate[]
  getMarketSupplyHistoryRates?: (
    data: unknown,
    protocolId: string
  ) => MarketRate[]
}
```

### 3. Structure des Dossiers

Chaque chaîne avec une configuration spécifique a son propre dossier :

```
src/lib/protocols/compound/v3/onchain/
├── index.ts                    # Logique principale et registry
├── queries.ts                  # Requêtes par défaut (Messari)
├── transformers.ts             # Transformateurs par défaut
├── optimism/                   # Configuration spécifique à Optimism
│   ├── index.ts               # Enregistrement de la chaîne
│   ├── queries.ts             # Requêtes spécifiques à Optimism
│   ├── transformers.ts        # Transformateurs spécifiques à Optimism
│   └── generated/             # Types GraphQL générés
└── arbitrum/                  # Configuration spécifique à Arbitrum (si nécessaire)
    ├── index.ts
    ├── queries.ts
    └── transformers.ts
```

## Implémentation pas à pas

### Étape 1: Créer le dossier de la chaîne

```bash
mkdir src/lib/protocols/compound/v3/onchain/optimism
```

### Étape 2: Définir les requêtes spécifiques

`optimism/queries.ts`:
```typescript
import { gql } from 'urql'

export const USER_LEND_POSITIONS = gql`
  query UserSupplyPositions($where: Account_filter) {
    accounts(where: $where) {
      address
      positions {
        market {
          id
          configuration {
            name
            symbol
            baseToken {
              token {
                symbol
                name
                decimals
                address
              }
            }
          }
          protocol {
            accounting {
              avgNetSupplyApr
              avgSupplyApr
              avgRewardSupplyApr
            }
          }
        }
        accounting {
          id
          baseBalance
          baseBalanceUsd
          basePrincipal
        }
      }
    }
  }
`
```

### Étape 3: Implémenter les transformateurs

`optimism/transformers.ts`:
```typescript
export function getUserSupplyPositions(
  data: unknown,
  protocolId: string
): SupplyPosition[] {
  const queryData = data as UserSupplyPositionsQuery
  if (!queryData?.accounts) return []

  return queryData.accounts.flatMap((account) => {
    return account.positions
      .filter((position) => {
        const balance = BigInt(position.accounting?.baseBalance ?? 0)
        return balance > 0n
      })
      .map((position): SupplyPosition => {
        // Logique de transformation spécifique à Optimism
        const token = position.market?.configuration?.baseToken?.token
        return {
          id: position.accounting?.id,
          protocol: protocolId,
          network: 'optimism',
          userAddress: account.address.toLowerCase(),
          poolName: position.market?.configuration?.name,
          assetAddress: token?.address,
          // ... autres champs spécifiques
        }
      })
  })
}
```

### Étape 4: Enregistrer la chaîne

`optimism/index.ts`:
```typescript
import { optimism } from 'viem/chains'
import { COMPOUND_V3_CHAINS } from '../config'
import { createChainClient, registerChain } from '../index'
import { USER_BORROW_POSITIONS, USER_LEND_POSITIONS } from './queries'
import { getUserBorrowPositions, getUserSupplyPositions } from './transformers'

const config = COMPOUND_V3_CHAINS[optimism.id]

const optimismClient = createChainClient(
  config.custom.subgraphUrl!,
  process.env.THEGRAPH_API_KEY
)

// Enregistrement avec queries et transformers personnalisés
registerChain({
  client: optimismClient,
  chainId: config.id,
  chainName: config.name,
  queries: {
    USER_LEND_POSITIONS,
    USER_BORROW_POSITIONS,
  },
  transformers: {
    getUserSupplyPositions,
    getUserBorrowPositions,
  },
})
```

## Fonctionnement du Runtime

### 1. Auto-enregistrement

Lors de l'initialisation du module, chaque chaîne s'enregistre automatiquement :

```typescript
// Import automatique des configurations de chaînes
import './optimism'  // Déclenche l'enregistrement d'Optimism
import './arbitrum'  // Déclenche l'enregistrement d'Arbitrum (si présent)
```

### 2. Résolution des requêtes et transformateurs

Le système résout les requêtes et transformateurs au runtime :

```typescript
const chainClients = await getChainClients()
const results = await Promise.allSettled(
  chainClients.map(async ({ client, chainName, queries, transformers }) => {
    // Utilise la requête spécifique si disponible, sinon la requête par défaut
    const query = queries?.USER_SUPPLY_POSITIONS || USER_SUPPLY_POSITIONS

    const { data, error } = await client.query(query, variables).toPromise()

    // Utilise le transformateur spécifique si disponible, sinon la logique par défaut
    if (transformers?.getUserSupplyPositions && data) {
      return transformers.getUserSupplyPositions(data, protocolId)
    }

    // Logique de transformation par défaut
    return defaultTransform(data)
  })
)
```

## Cas d'Usage

### 1. Schémas de Subgraph Différents

**Messari (par défaut):**
```graphql
accounts {
  positions {
    balance
    asset {
      symbol
      lastPriceUSD
    }
  }
}
```

**Spencer.papercliplabs.eth (Optimism):**
```graphql
accounts {
  positions {
    accounting {
      baseBalance
      baseBalanceUsd
    }
    market {
      configuration {
        baseToken {
          token {
            symbol
          }
        }
      }
    }
  }
}
```

### 2. Calculs Spécifiques

Certaines chaînes peuvent nécessiter des calculs différents :

- **Optimism**: Utilise `baseBalanceUsd` directement
- **Ethereum**: Calcule `balance * lastPriceUSD`
- **Arbitrum**: Peut avoir des fields supplémentaires pour les rewards

## Avantages

### 1. Flexibilité
- Chaque chaîne peut avoir son propre schéma
- Pas de breaking changes quand une chaîne ajoute de nouveaux fields
- Migration progressive possible

### 2. Performance
- Les chaînes sans schéma custom utilisent les requêtes par défaut
- Pas de surcharge pour les cas standards
- Lazy loading des configurations spécifiques

### 3. Maintenabilité
- Isolement du code spécifique à chaque chaîne
- Tests unitaires possibles par chaîne
- Ajout facile de nouvelles chaînes

## Bonnes Pratiques

### 1. Convention de Nommage
- Utiliser le nom de la chaîne en minuscules pour le dossier
- Préfixer les types avec le nom de la chaîne : `UserSupplyPositionsQuery`
- Utiliser des noms explicites pour les transformateurs

### 2. Gestion des Erreurs
- Toujours vérifier l'existence des données avant transformation
- Logger les erreurs spécifiques à la chaîne
- Fournir des valeurs par défaut sécurisées

### 3. Types TypeScript
- Générer les types GraphQL pour chaque chaîne
- Utiliser des guards de type pour la sécurité
- Documenter les différences de schéma

### 4. Tests
- Tester chaque transformateur avec des mock data
- Tester les cas limites (données manquantes, schémas différents)
- Tests d'intégration avec les vrais subgraphs

## Extensibilité Future

### 1. Support de Nouvelles Fonctionnalités
Le système peut être étendu pour supporter :
- Des middleware de transformation
- Du caching spécifique par chaîne
- De la monitoring et métriques par chaîne

### 2. Gestion des Versions
- Support multi-versions du même protocole sur une chaîne
- Migration automatique entre les versions
- Compatibility layers

### 3. Configuration Dynamique
- Chargement des configurations depuis des fichiers externes
- Mise à jour des configurations sans redéploiement
- Feature flags par chaîne

## Conclusion

Ce système d'enregistrement de chaînes offre une solution robuste et flexible pour gérer les différences de schéma entre les subgraphs de différentes chaînes blockchain. Il permet de maintenir un code propre et extensible tout en assurant la compatibilité avec les spécificités de chaque écosystème blockchain.
