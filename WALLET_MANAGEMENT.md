# Wallet Management System

## Architecture

Le système de gestion des wallets utilise une architecture basée sur **Zustand** pour le state management et un **watcher** pour détecter automatiquement les changements de comptes.

### Composants principaux

1. **`walletStore.ts`** - Store Zustand avec persistance locale
2. **`useWalletWatcher.ts`** - Hook qui écoute les événements du wallet
3. **`WalletWatcherProvider`** - Provider qui initialise le watcher

## Fonctionnement

### 1. Détection automatique des comptes

Le `useWalletWatcher` écoute l'événement `accountsChanged` du provider Ethereum :

```typescript
provider.on('accountsChanged', (accounts) => {
  // Traite et ajoute les nouveaux comptes au store
})
```

### 2. Stockage persistant

Tous les wallets sont automatiquement sauvegardés dans `localStorage` sous la clé `persist:account` grâce au middleware `persist` de Zustand.

### 3. Mise à jour en temps réel

Quand un utilisateur :

- Change de compte dans MetaMask
- Ajoute un nouveau compte via le bouton "+ Add"
- Se connecte avec un nouveau wallet

Le watcher détecte le changement et met à jour automatiquement :

- Le store Zustand
- Le localStorage
- Tous les composants qui utilisent `useWalletStore()`

## Utilisation

### Dans un composant

```typescript
import { useWalletStore } from '@/stores/walletStore'

function MyComponent() {
  const { wallets } = useWalletStore()

  return (
    <div>
      {wallets.map(wallet => (
        <div key={wallet.address}>
          {wallet.name} - {wallet.address}
        </div>
      ))}
    </div>
  )
}
```

### Accès direct au store

```typescript
import { useWalletStore } from '@/stores/walletStore'

function MyComponent() {
  const { wallets, addWallet, removeWallet, updateWallet } = useWalletStore()

  // Utiliser les méthodes du store
}
```

## Méthodes disponibles

### Store Zustand

- `addWallet(wallet)` - Ajoute un wallet
- `addWallets(wallets)` - Ajoute plusieurs wallets
- `updateWallet(address, updates)` - Met à jour un wallet
- `removeWallet(address)` - Supprime un wallet
- `hasWallet(address)` - Vérifie si un wallet existe

## Structure des données

```typescript
interface Wallet {
  address: string
  name: string
  ens: string | null
  walletType: string | null
  smartContractWalletType: string | null
  isActive: boolean
  isConnected: boolean
  isCurrentlyConnected: boolean
  isBitcoin: boolean
  avatarUri: string
  roles: string[]
  isUpdating: boolean
}
```

## Configuration

Le watcher est initialisé automatiquement via le `WalletWatcherProvider` dans le layout principal :

```tsx
<Web3Provider>
  <WalletWatcherProvider>{/* Votre application */}</WalletWatcherProvider>
</Web3Provider>
```

## Avantages

✅ **Automatique** - Pas besoin de gérer manuellement les changements de compte
✅ **Persistant** - Les wallets sont sauvegardés automatiquement
✅ **Type-safe** - TypeScript pour tous les types
✅ **Performant** - Zustand ne re-render que les composants nécessaires
✅ **Testable** - Le store peut être testé indépendamment
✅ **Réutilisable** - Le store est accessible partout dans l'app
