# Projet 12

## Problématique

### Traduire une vraie application organisée

Les projets 00 à 11 isolent chacun une difficulté. Le projet 12 est une **vraie application**, organisée comme en production selon une architecture **MVC** : une boutique qui reçoit des requêtes (lister les produits, passer une commande, lister les commandes d'un client) et renvoie des réponses HTTP.

Il sert de **cible** : il mélange ce que le transpileur sait déjà traduire et ce qu'il ne sait pas encore traduire. Tant qu'il n'est pas entièrement traduit, il reste dans la liste des programmes cibles des tests e2e (`it.fails`) ; le jour où le Go affiche la même chose que TypeScript, ce test casse, et le projet passe dans la liste normale.

## Architecture

```
projects/12/
├── models/          types métier et règles pures
│   ├── product.ts       Product, hasStock, withdrawStock
│   ├── customer.ts      Customer
│   └── order.ts         Order, OrderLine, PricedLine, priceLine, computeSubtotal, applyDiscount
├── repositories/    accès aux données : stockage en mémoire, API asynchrone
│   ├── productRepository.ts   findAll, findById, save (le stock évolue)
│   ├── customerRepository.ts  findById
│   └── orderRepository.ts     count, save, findByCustomer
├── services/        logique applicative
│   └── orderService.ts        placeOrder : client, lignes, stock, remise, enregistrement
├── controllers/     requête → réponse : statut HTTP et traduction des erreurs métier
│   ├── response.ts            ok, created, failure
│   ├── productController.ts   list
│   └── orderController.ts     place, listForCustomer
├── views/           mise en forme des réponses
│   ├── format.ts              formatPrice
│   ├── productView.ts         renderProduct, renderProductList
│   ├── orderView.ts           renderOrder, renderOrderList
│   └── errorView.ts           renderError
├── router.ts        aiguillage d'une requête (union discriminée) vers son contrôleur
└── index.ts         composition de l'application et scénario de requêtes
```

Chaque couche ne dépend que de celles du dessous ; les dépendances sont **injectées** (`createOrderService({ products, customers, orders })`), comme dans une application testable.

## Scénario (`index.ts`)

1. lister les produits ;
2. Alice commande 2 claviers et 1 écran avec le code `WELCOME10` → **201**, remise de 10 % ;
3. Bob (VIP) commande 2 claviers → **409** : il n'en reste qu'un (le stock a baissé à l'étape 2) ;
4. Bob commande 1 écran → **201**, remise VIP de 25 % ;
5. un client inconnu commande → **404** ;
6. Alice envoie une commande vide → **400** ;
7. lister les commandes de Bob ;
8. lister les produits : le stock reflète les commandes.

## Ce que l'application met à l'épreuve

Déjà traduit par les projets 00 à 11 : `DEither` (`left`, `success`, `asyncGroup`, `isLeft`, `unwrapRight`, `matchInformation`), `DArray.map`, `DString.to`, `DCommon.print`, fonctions fléchées, gabarits de chaîne, ternaires, `if` / `return`, `async` / `await`.

Pas encore traduit (voir `docs/inventaire/2026-11-19-non-traite.md`) :
- **objets** : objets littéraux, `interface`, champs optionnels (`discountCode?`), accès `obj.champ`, décomposition `{ ...product, stock }`, objets renvoyés par des fabriques (`createProductRepository()` renvoie un objet de méthodes) ;
- **déstructuration d'objet** : en paramètre (`({ products, customers, orders }) =>`), dans une boucle (`for (const { product, quantity } of lines)`) et dans un gestionnaire (`({ productId, requested, available }) =>`) ;
- **état modifiable et fermetures** : `let products = …` réaffecté dans `save`, capturé par les méthodes du repository ;
- **union discriminée et `switch`** dans le routeur ;
- **boucles** `for…of` avec `await` ;
- **fonctions et interfaces génériques** : `Response<GenericBody>`, `ok<GenericBody>(…)` ;
- **types calculés** : `ReturnType<typeof createOrderService>` ;
- **`??`**, accès par clé sur un `Record` (`discountRates[code]`) ;
- **`DArray`** : `find`, `filter`, `reduce`, `concat`, `lengthEqual` ;
- **`DString.padStart`** ;
- **API JS intégrées** : `Math.round`, `Promise.resolve`, `.length` ;
- **`await` au niveau du module**.

Aujourd'hui, la traduction s'arrête sur le premier **type d'objet** (`TypeLiteral`).

## Sortie attendue (TypeScript)

Huit réponses `{ status, body }`, dans l'ordre du scénario : `200` (3 produits), `201` (`CMD-001`, total `313.92 €`), `409` (stock insuffisant pour `kbd` : 2 demandés, 1 disponible), `201` (`CMD-002`, total `186.75 €`), `404` (client inconnu : `carla`), `400` (commande vide), `200` (`{ count: 1, references: ["CMD-002"] }`), `200` (produits : clavier 1 en stock, souris et écran épuisés).
