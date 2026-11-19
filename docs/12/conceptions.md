# Projet 12 : conception

## Le problème

Les exercices 00 à 11 testent chacun une idée. 12 est un **vrai programme** : une gestion de commandes organisée en MVC, 16 fichiers, 516 lignes. Pas de base de données : les dépôts gardent leurs données en mémoire.

```
models/        Product, Customer, Order (types + règles : hasStock, withdrawStock, prix)
repositories/  productRepository, customerRepository, orderRepository (en mémoire)
services/      orderService : passer une commande (client, stock, remise VIP / code)
controllers/   productController, orderController, response (statut + corps)
views/         productView, orderView, errorView, format (prix « 49.9 € »)
router.ts      une requête { route, body? } → le bon contrôleur (switch)
index.ts       composition des couches, puis un scénario de 8 requêtes affichées
```

Le scénario passe par tous les chemins : liste des produits, commande réussie, stock insuffisant (409), remise, client inconnu (404), commande vide (400), commandes d'un client, stock mis à jour.

## Résultat

12 compile, passe `go vet`, et Go affiche **les mêmes 8 réponses** que TS. Le test e2e compare les valeurs (Node affiche des objets, Go du JSON ; le test lit les deux).

`pnpm test` : **44 tests sur 44 au vert**, dont 12, passé de « programme cible » (`it.fails`) à la liste normale. Lint, `tsc` et `--noUnusedLocals` passent ; 00 à 12 passent `go vet`.

Trois commits :

| Commit | Contenu |
|---|---|
| `8d074bf` | les objets TS en structs Go |
| `0857c07` | accès aux champs, collections `DArray`, affectations, fonctions `void` |
| `0026bb7` | tout ce qui manquait pour que 12 compile et s'exécute |

## Les idées utilisées

### 1. Un objet TS est une struct Go anonyme

Décision prise en party mode : la forme Go d'un objet est une **struct anonyme**, et un type nommé (`interface Product`, `type Order = { … }`) devient un **alias** Go (`type Product = struct{ … }`). Avec un alias, deux types TS de même forme sont le même type Go, comme le typage structurel de TS.

- Champ : nom en majuscule pour Go, nom exact dans l'étiquette JSON (`Id string "json:\"id\""`).
- Champ optionnel `a?: T` : union `T | undefined`, étiquette `,omitzero` (la clé disparaît du JSON quand elle vaut `undefined`, comme en JS).
- `Record<string, T>` : `map[string]T`.
- Sémantique de valeur : une struct Go est copiée. Les objets DuploJS sont immuables, donc c'est sans effet.
- Refusés avec une erreur nommée : type récursif, ordre des clés différent de l'ordre d'insertion JS (le JSON ne serait pas le même).

### 2. Un littéral est produit dans le type attendu

`const p: Product = { … }` : le littéral est construit **directement** dans le type attendu, et chaque valeur est convertie à sa place. Ce n'est pas un littéral de son propre type converti après coup.

Nouveau avec 12 : quand le type attendu est une **union d'objets** (`requests: Request[]`, où `Request` est une union discriminée), le littéral est construit dans le membre vers lequel il se convertit. TS fait de même pour les objets imbriqués : sans cela, l'objet extérieur et le `body` intérieur n'avaient pas le même type Go.

### 3. `undefined` toujours en variante 0

Une union qui contient `undefined` l'a toujours en **variante 0**. Sa valeur zéro Go (`Union2[JSUndefined, T]{}`) veut donc dire `undefined`. Tout ce qui suit en profite :

| TS | Go |
|---|---|
| `x === undefined`, `x !== null` | `x.Tag == 0` (test de la variante) ; constante si le type ne peut pas valoir `undefined` |
| `a ?? b` | `if a.Tag == 0 { b } else { a.V1 }`, `b` évalué seulement si besoin |
| `table[clé]` sur un `Record` | `MapGet(table, clé)` → `Union2[JSUndefined, T]` (clé absente : `undefined`) |
| `DArray.find(…)` | `Find(…)` → `Union2[JSUndefined, T]` |
| `f(a)` avec `f(a, b?: number)` | `f(a, Union2[JSUndefined, float64]{})` : l'argument manquant vaut `undefined` |

### 4. Les arguments sont convertis vers les paramètres

À chaque appel, chaque argument est converti vers le type du paramètre de la signature résolue : un `4` passé à `b?: number` devient `Union2{Tag: 1, V1: 4}`. Les paramètres manquants reçoivent la valeur zéro de leur union.

`shortcut` : si le type d'un paramètre n'a pas d'équivalent Go (type calculé d'une bibliothèque, comme celui de `DCommon.print`), les arguments sont laissés tels quels.

### 5. `switch` avec la sémantique JS

- `break` final retiré : Go ne passe pas au cas suivant.
- Cas qui ne finit ni par `break`, ni par `return`, ni par `throw` : `fallthrough`.
- `case a:` vides qui se suivent : `case a, b:`.
- `case a: default:` : `default` couvre déjà `a`. La revue a trouvé que `a` glissait dans le cas suivant ; c'est corrigé.

Go ne sait pas qu'un `switch` exhaustif renvoie toujours une valeur (`missing return`). Une fonction non-`void` qui ne finit pas par `return` se termine donc par `panic("unreachable")`, jamais atteint (TS a déjà vérifié tous les chemins).

### 6. `DArray.reduce` comme DuploJS

Le rappel reçoit `{ element, index, lastValue, next, exit }` et renvoie `next(v)` ou `exit(v)`. En Go : une fonction partagée `Reduce[T, A]`, et deux structs `ReduceParams[T, A]` et `ReduceStep[A]`. Les types DuploJS (`ReduceNext`, `ReduceExit`…) sont traduits vers ces structs.

`shortcut` : `nextPush`, `nextWithObject`, `self`, et un `exit` d'un autre type que l'accumulateur ne sont pas fournis. À ajouter quand un programme les utilisera.

### 7. N'importer que ce qui est écrit

Un type peut être **calculé** sans être **écrit** dans le Go : rétrécissement, déstructuration (`({ product }) =>`). Le calcul enregistrait l'import du paquet du type, d'où des imports inutilisés, que Go refuse. Désormais, à l'écriture du fichier, seuls les paquets dont le nom apparaît dans le code Go produit sont importés.

### 8. Types utilitaires calculés par le checker

`ReturnType`, `Awaited`, `Parameters`, `InstanceType`, `NonNullable` : le checker calcule le type, qui est ensuite traduit comme un type écrit à la main.

## Revue

Une revue indépendante a confirmé deux défauts, tous deux corrigés avant le commit :

1. `case a: default:` faisait glisser `a` dans le cas suivant : mauvais résultat, sans erreur Go.
2. Les paramètres optionnels cassaient les appels : nombre d'arguments ou type Go faux.

Nouveau test d'exécution `control-flow-runtime` : `switch` (passage au cas suivant, `default` regroupé), `??`, lecture de dictionnaire, paramètres optionnels. Go affiche les mêmes valeurs que TS.

## Limites connues

- Pas de test qui exécute `DArray.reduce` en dehors de 12.
- Une variable affectée mais jamais lue donne l'erreur Go « declared and not used ».
- L'ordre des clés d'un `map` Go dans le JSON diffère de l'ordre d'insertion JS.
- Une fonction locale est déclarée là où elle est écrite : la remontée JS (« hoisting ») n'est pas reproduite.
- Modèle asynchrone synchrone : `Promise<T>` est traduit en `T`, `await x` en `x`. Voir 10.
