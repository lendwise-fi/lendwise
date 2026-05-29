# DeFiLlama Historical Market Data Enrichment

## Contexte

Les documents `apy.daily` créés par le backfill (`quality.status = 'historical'`) contiennent des données APY correctes mais des champs `market` à zéro :

```json
{
  "_id": "aave:v3:ethereum:reserve:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:supply:2025-01-15",
  "productId": "aave:v3:ethereum:reserve:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:supply",
  "quality": { "status": "historical" },
  "apy": { "base": 0.0312, "net": 0.0312, ... },
  "market": {
    "supplyAssets": 0,
    "supplyAssetsUsd": 0,
    "utilizationRate": 0,
    "assetPriceUsd": 0      ← non enrichi
  }
}
```

**Objectif :** Peupler les champs `market` via les APIs DeFiLlama pour tous les documents `historical` non enrichis (`market.assetPriceUsd = 0`).

---

## Infrastructure existante

L'essentiel est déjà en place :

| Fichier                                      | Rôle                                                            |
| -------------------------------------------- | --------------------------------------------------------------- |
| `src/lib/defillama.ts`                       | Appels API : liste des pools, historique yield, historique prix |
| `src/lib/protocols/enrich-adapter.ts`        | Interface `EnrichAdapter`                                       |
| `src/lib/protocols/aave/v3/market-enrich.ts` | Adaptateur Aave V3                                              |
| `scripts/apy-market-enrich.ts`               | Script principal (`pnpm apy:enrich-market`)                     |

Le script est fonctionnel mais **échoue silencieusement pour les déploiements spéciaux Ethereum** (Lido, EtherFi, Horizon) à cause d'un problème de matching DeFiLlama.

---

## Données DeFiLlama utilisées

### Yields API — `/pools`

Chaque pool Aave V3 a la structure suivante :

```json
{
  "pool": "aa70268e-4b52-42bf-a116-608b370f9501",
  "chain": "Ethereum",
  "project": "aave-v3",
  "symbol": "USDC",
  "poolMeta": null,
  "underlyingTokens": ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"]
}
```

> **Point clé :** Le champ `poolMeta` est `null` pour la plupart des pools, mais vaut
> `"lido-market"`, `"etherfi-market"` ou `"horizon-market"` pour les déploiements spéciaux Ethereum
> (valeurs vérifiées le 2026-05-02 via `/pools`).

### Yields API — `/chart/{poolId}`

Historique daily (une entrée par jour) :

```json
{
  "data": [
    {
      "timestamp": "2025-01-15T00:00:00.000Z",
      "tvlUsd": 892000000,
      "totalSupplyUsd": 1200000000,
      "totalBorrowUsd": 892000000,
      "utilization": 0.743
    }
  ]
}
```

- `totalSupplyUsd` → `market.supplyAssetsUsd`
- `totalBorrowUsd` → `market.borrowAssetsUsd`
- `utilization` → `market.utilizationRate` (fraction 0–1, **pas un pourcentage**)
- Fallback si `totalSupplyUsd = null` : utiliser `tvlUsd`

### Coins API — `/chart/{chain}:{address}`

Prix historique du token (paramètre `period=1d`) :

```json
{
  "coins": {
    "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {
      "prices": [{ "timestamp": 1736899200, "price": 1.0001 }]
    }
  }
}
```

- `price` → `market.assetPriceUsd`
- `supplyAssets = supplyAssetsUsd / assetPriceUsd`
- `borrowAssets = borrowAssetsUsd / assetPriceUsd`

---

## Problème central : disambiguation des pools Ethereum

Plusieurs déploiements Aave V3 cohabitent sur la même blockchain Ethereum (chainId=1) avec les mêmes tokens :

| productId (notre format)       | Déploiement Aave      | DeFiLlama chain |
| ------------------------------ | --------------------- | --------------- |
| `aave:v3:ethereum:...`         | AaveV3Ethereum        | Ethereum        |
| `aave:v3:ethereum-lido:...`    | AaveV3EthereumLido    | Ethereum        |
| `aave:v3:ethereum-etherfi:...` | AaveV3EthereumEtherFi | Ethereum        |
| `aave:v3:ethereum-horizon:...` | AaveV3EthereumHorizon | Ethereum        |

Le `findPool` actuel dans `defillama.ts` mappe tous les slugs `ethereum-*` vers `'Ethereum'`, donc il retourne **le premier pool trouvé** pour le token — ce qui peut être n'importe lequel des quatre déploiements.

### Exemple concret — USDC

USDC (`0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`) est présent dans les 4 déploiements.

Nos productIds :

```
aave:v3:ethereum:reserve:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:supply
aave:v3:ethereum-lido:reserve:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:supply
aave:v3:ethereum-etherfi:reserve:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:supply
```

Si DeFiLlama a des pools séparés avec `poolMeta` :

```json
{ "pool": "uuid-A", "chain": "Ethereum", "symbol": "USDC", "poolMeta": null }
{ "pool": "uuid-B", "chain": "Ethereum", "symbol": "USDC", "poolMeta": "lido" }
{ "pool": "uuid-C", "chain": "Ethereum", "symbol": "USDC", "poolMeta": "etherfi" }
```

→ Il faut enrichir chaque slug avec le bon pool UUID.

Si DeFiLlama **ne distingue pas** les déploiements (un seul pool USDC/Ethereum) :
→ Les 4 slugs partagent les mêmes données de marché (approximation acceptable).

---

## Étape de vérification

Avant d'implémenter, vérifier la réponse DeFiLlama pour USDC sur Ethereum :

```bash
# Lister tous les pools Aave V3 sur Ethereum avec USDC
curl -s 'https://yields.llama.fi/pools' | \
  jq '[.data[] | select(.project=="aave-v3" and .chain=="Ethereum") | {pool, symbol, poolMeta, underlyingTokens}]' | \
  jq '[.[] | select(.underlyingTokens[] | ascii_downcase | contains("0xa0b86991"))]'
```

**Résultats attendus :**

_Cas A — DeFiLlama distingue les déploiements (poolMeta renseigné) :_

```json
[
  {
    "pool": "aa70268e-...",
    "symbol": "USDC",
    "poolMeta": null,
    "underlyingTokens": ["0xa0b86991..."]
  },
  {
    "pool": "effcb4a4-...",
    "symbol": "USDC",
    "poolMeta": "lido-market",
    "underlyingTokens": ["0xa0b86991..."]
  },
  {
    "pool": "b6fdb4b4-...",
    "symbol": "USDC",
    "poolMeta": "etherfi-market",
    "underlyingTokens": ["0xa0b86991..."]
  },
  {
    "pool": "27296bf9-...",
    "symbol": "USDC",
    "poolMeta": "horizon-market",
    "underlyingTokens": ["0xa0b86991..."]
  }
]
```

> ✅ **Vérifié le 2026-05-02** : Cas A confirmé avec 4 pools distincts.

_Cas B — Un seul pool (pas de distinction) :_

```json
[
  {
    "pool": "aa70268e-...",
    "symbol": "USDC",
    "poolMeta": null,
    "underlyingTokens": ["0xa0b86991..."]
  }
]
```

> La suite de ce plan suppose le **Cas A** (le plus probable d'après la structure Aave).
> Si Cas B, la logique de `findPool` reste inchangée et tous les slugs ethereum-\* partagent
> les mêmes données — il faut juste l'accepter comme approximation.

---

## Plan d'implémentation

### Tâche 1 — Mettre à jour `findPool` dans `defillama.ts`

Ajouter un paramètre optionnel `poolMeta` pour filtrer sur le champ DeFiLlama :

```typescript
// Mapping de notre slug → poolMeta DeFiLlama (valeurs vérifiées 2026-05-02)
const POOL_META_MAP: Record<string, string | null> = {
  ethereum: null,
  'ethereum-lido': 'lido-market',
  'ethereum-etherfi': 'etherfi-market',
  'ethereum-horizon': 'horizon-market',
}

export function findPool(
  pools: DefiLlamaPool[],
  chain: string, // notre slug : 'ethereum', 'ethereum-lido', ...
  tokenAddress: string
): DefiLlamaPool | null {
  const targetChain = (YIELDS_CHAIN_MAP[chain] ?? chain).toLowerCase()
  const targetToken = tokenAddress.toLowerCase()
  const expectedMeta = POOL_META_MAP[chain] // undefined si slug inconnu

  return (
    pools.find(
      (p) =>
        p.chain.toLowerCase() === targetChain &&
        p.underlyingTokens.some((t) => t.toLowerCase() === targetToken) &&
        (expectedMeta === undefined || p.poolMeta === expectedMeta)
    ) ?? null
  )
}
```

> Si `expectedMeta === undefined` (slug non dans POOL_META_MAP), le filtre poolMeta est ignoré
> → comportement actuel préservé pour les autres chains (Polygon, Arbitrum, etc.).

### Tâche 2 — Ajouter `poolMeta` au type `DefiLlamaPool`

```typescript
export type DefiLlamaPool = {
  pool: string
  chain: string
  project: string
  symbol: string
  poolMeta: string | null // ← ajouter
  underlyingTokens: string[]
}
```

### Tâche 3 — Vérifier `market-enrich.ts` (adaptateur Aave)

Le `getGroupKey` actuel retourne `${chain}:${tokenAddress}` :

- `ethereum:0xa0b86991...` → group clé du déploiement principal
- `ethereum-lido:0xa0b86991...` → group clé du déploiement Lido

Ces deux groupes appellent `findPool` avec des slugs différents → si `POOL_META_MAP` est correctement renseigné, chacun trouvera son pool DeFiLlama distinct. **Aucune modification nécessaire** dans l'adaptateur.

### Tâche 4 — Lancer l'enrichissement et vérifier

```bash
# Dry-run sur Ethereum d'abord (déploiement principal)
pnpm apy:enrich-market -- --chain ethereum --dry-run

# Dry-run sur les déploiements spéciaux
pnpm apy:enrich-market -- --chain ethereum-lido --dry-run
pnpm apy:enrich-market -- --chain ethereum-etherfi --dry-run

# Lancer pour de vrai
pnpm apy:enrich-market -- --chain ethereum
pnpm apy:enrich-market -- --chain ethereum-lido

# Spot-check : vérifier qu'assetPriceUsd est non-zéro
# MongoDB :
# db['apy.daily'].findOne({
#   productId: /^aave:v3:ethereum-lido:/,
#   'quality.status': 'historical',
#   'market.assetPriceUsd': { $gt: 0 }
# })
```

---

## Exemple de résultat attendu

### Avant enrichissement

```json
{
  "_id": "aave:v3:ethereum-lido:reserve:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:supply:2025-01-15",
  "productId": "aave:v3:ethereum-lido:reserve:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:supply",
  "market": {
    "supplyAssets": 0,
    "supplyAssetsUsd": 0,
    "utilizationRate": 0,
    "assetPriceUsd": 0
  }
}
```

### Après enrichissement (Cas A — pool Lido distinct)

```json
{
  "_id": "aave:v3:ethereum-lido:reserve:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:supply:2025-01-15",
  "market": {
    "supplyAssets": 48200000,
    "supplyAssetsUsd": 48200000,
    "utilizationRate": 0.71,
    "assetPriceUsd": 1.0001
  }
}
```

### Après enrichissement (Cas B — pool partagé avec ethereum)

```json
{
  "_id": "aave:v3:ethereum-lido:reserve:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:supply:2025-01-15",
  "market": {
    "supplyAssets": 1198800000,
    "supplyAssetsUsd": 1200000000,    ← TVL du pool Ethereum principal
    "utilizationRate": 0.743,
    "assetPriceUsd": 1.0001
  }
}
```

> Dans le Cas B, les valeurs de marché sont identiques entre `ethereum:...` et `ethereum-lido:...`
> pour le même token et la même date. C'est une approximation : les deux déploiements ont des
> TVL distincts, mais l'APY historique (la donnée principale) reste correcte.

---

## Points de vigilance

| Sujet                 | Détail                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `utilization` units   | DeFiLlama retourne une fraction (0.74 = 74%), **pas un pourcentage** — déjà géré dans `buildYieldMap` |
| `totalSupplyUsd` null | Fallback sur `tvlUsd` — déjà géré                                                                     |
| Rate limiting         | `fetchWithRetry` + `batchedMap(concurrency=5, delay=300ms)` — déjà en place                           |
| Idempotence           | Filtre `market.assetPriceUsd: 0` — 2e run ne traite que les docs non enrichis                         |
| Docs EtherFi/Horizon  | Peu de données historiques (déploiements récents) → peu de docs `historical`, faible impact           |

---

## Ordre d'exécution recommandé

1. **Vérifier** le `curl` ci-dessus pour déterminer Cas A ou Cas B
2. Si Cas A : implémenter Tâche 1 + Tâche 2
3. Lancer `pnpm apy:enrich-market -- --dry-run` sur chaque chain
4. Lancer l'enrichissement complet : `pnpm apy:enrich-market`
5. Spot-check MongoDB sur un doc `ethereum-lido` et un doc `ethereum`
