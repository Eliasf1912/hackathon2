# Projet 12

## Problématique

### Traduire un vrai programme complet

Les projets 00 à 11 isolent chacun une difficulté. Le projet 12 est un **vrai programme**, écrit comme on écrirait une application DuploJS : une petite gestion de commandes (catalogue de produits, contrôle du stock, prix, remises, rapport d'erreurs), répartie en plusieurs fichiers.

Il sert de **cible** : il mélange ce que le transpileur sait déjà traduire et ce qu'il ne sait pas encore traduire. Tant qu'il n'est pas entièrement traduit, il reste dans la liste des programmes cibles des tests e2e (`it.fails`) ; le jour où le Go affiche la même chose que TypeScript, ce test casse, et le projet passe dans la liste normale.

## Fichiers

| Fichier | Rôle |
|---|---|
| `catalog.ts` | type `Product` (`interface`), catalogue (tableau d'objets), recherche d'un produit (`Either`) |
| `order.ts` | lignes de commande, prix d'une ligne avec contrôle du stock, sous-total, remise |
| `format.ts` | mise en forme des prix et des noms de clients |
| `domain.ts` | ré-exportations (`export * from`) |
| `index.ts` | chargement asynchrone des commandes, traitement, affichage |

## Ce que le programme met à l'épreuve

Déjà traduit par les projets 00 à 11 :
- `DEither` : `left`, `success`, `rightPipe`, `group`, `whenIsRightOtherwise`, `matchInformation` ;
- `DArray.map`, `DString.to`, `DCommon.print` ;
- fonctions fléchées, gabarits de chaîne, `if` / `return`, `async` / `await`.

Pas encore traduit (voir `docs/inventaire/2026-11-19-non-traite.md`) :
- **objets** : objets littéraux, `interface`, champ optionnel (`discountCode?`), accès `obj.champ`, objet en valeur d'une erreur (`left("out-of-stock", { … })`) ;
- **déstructuration d'objet** : en paramètre (`({ customer, lines, discountCode }) =>`) et dans un gestionnaire (`({ productId, requested, available }) =>`) ;
- **`??`** et accès par clé (`discountRates[code]`) sur un `Record` ;
- **ré-exportations** (`export * from`) ;
- **`DArray`** : `find`, `filter`, `some`, `reduce` ;
- **`DString`** : `padStart`, `toUpperCase` ;
- **API JS intégrées** : `Math.round`, `Promise.resolve` ;
- **`await` au niveau du module**.

## Sortie attendue (TypeScript)

```
[{"customer":"...ALICE","items":["2 x Clavier","1 x Écran 27\""],"subtotal":"348.8 €","total":"313.92 €"},
 {"customer":".....BOB","error":"stock insuffisant pour mse (1 demandés, 0 disponibles)"},
 {"customer":"...CARLA","error":"produit inconnu : cam"}]
["Clavier","Écran 27\""]
true
```
