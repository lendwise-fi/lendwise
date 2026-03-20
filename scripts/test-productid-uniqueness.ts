import { fetchAaveV3Products } from '@/lib/protocols/aave/v3/products'

// ─── Test script pour détecter les doublons de productId ──────────────────────

/**
 * Script de test pour vérifier l'unicité des productId générés par buildProductId
 * Utilise la même fonction fetchAaveV3Products que le script de production
 */

async function checkProductIdUniqueness() {
  console.log('🔍 Vérification de l\'unicité des productId pour AAVE V3...')
  
  try {
    // Récupérer tous les produits AAVE V3
    const products = await fetchAaveV3Products()
    
    console.log(`📊 Total des produits récupérés: ${products.length}`)
    
    // Extraire tous les productId
    const productIds = products.map(p => p._id)
    
    // Compter les occurrences de chaque productId
    const idCounts = new Map<string, number>()
    productIds.forEach(id => {
      idCounts.set(id, (idCounts.get(id) || 0) + 1)
    })
    
    // Filtrer les doublons (occurrences > 1)
    const duplicates = Array.from(idCounts.entries())
      .filter(([_, count]) => count > 1)
      .sort(([_, a], [__, b]) => b - a) // Trier par nombre d'occurrences décroissant
    
    console.log(`\n🎯 Résultats de l'analyse:`)
    console.log(`- ProductIds uniques: ${idCounts.size}`)
    console.log(`- ProductIds en doublon: ${duplicates.length}`)
    
    if (duplicates.length > 0) {
      console.log(`\n❌ DOUBLONS DÉTECTÉS (${duplicates.length}):\n`)
      
      duplicates.forEach(([productId, count], index) => {
        console.log(`${index + 1}. "${productId}" - ${count} occurrences`)
        
        // Afficher les détails des produits concernés
        const duplicateProducts = products.filter(p => p._id === productId)
        duplicateProducts.forEach((product, productIndex) => {
          console.log(`   ${productIndex + 1}. ${product.kind.toUpperCase()} - ${product.asset.symbol} - ${product.protocol.name}`)
          console.log(`      Market: ${product.protocol.name}`)
          console.log(`      Chain: ${product.protocol.chain.name} (${product.protocol.chain.id})`)
          console.log(`      Address: ${product.protocol.address}`)
          console.log(`      Asset: ${product.asset.address}`)
        })
        console.log('')
      })
      
      // Analyse des causes possibles
      console.log(`🔍 Analyse des causes possibles:`)
      console.log(`Les doublons peuvent être causés par:`)
      console.log(`1. Même token sur différents marchés (ex: AaveV3Ethereum vs AaveV3EthereumLido)`)
      console.log(`2. Problème dans la logique de buildProductId`)
      console.log(`3. Données en double dans la réponse de l'API`)
      
    } else {
      console.log(`\n✅ Aucun doublon détecté! Tous les productId sont uniques.`)
    }
    
    // Statistiques supplémentaires
    console.log(`\n📈 Statistiques détaillées:`)
    const supplyProducts = products.filter(p => p.kind === 'supply')
    const borrowProducts = products.filter(p => p.kind === 'borrow')
    
    console.log(`- Produits supply: ${supplyProducts.length}`)
    console.log(`- Produits borrow: ${borrowProducts.length}`)
    
    // Groupement par marché
    const marketCounts = new Map<string, number>()
    products.forEach(p => {
      const marketKey = `${p.protocol.name} (${p.protocol.chain.name})`
      marketCounts.set(marketKey, (marketCounts.get(marketKey) || 0) + 1)
    })
    
    console.log(`\n🌍 Répartition par marché:`)
    Array.from(marketCounts.entries())
      .sort(([_, a], [__, b]) => b - a)
      .forEach(([market, count]) => {
        console.log(`- ${market}: ${count} produits`)
      })
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution du test:', error)
    process.exit(1)
  }
}

// Exécuter le test
checkProductIdUniqueness()
