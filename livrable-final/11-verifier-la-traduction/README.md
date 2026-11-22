# 11 · Vérifier que la traduction est juste

**Le problème :** un Go qui **compile** ne fait pas forcément **la même chose** que le TypeScript. Comment le savoir ?

## Pourquoi c'est difficile
Trois façons d'échouer, de la plus visible à la plus dangereuse :

| Échec | Ce qui se passe | On le voit ? |
|---|---|---|
| refus | le transpileur s'arrête avec un nom d'erreur (voir [12](../12-refus-stricts/)) | tout de suite |
| Go invalide | la traduction passe, `go build` échoue | oui, mais loin de la cause |
| **comportement différent** | tout compile, le résultat diffère | **non, c'est silencieux** |

Exemple vécu : pendant une fusion de branches, un changement sur les chemins a cassé tous les projets à plusieurs fichiers, dont l'exercice 12, sans que personne le voie tout de suite.

## L'idée
La preuve, c'est **la même sortie**. Un banc, pour chaque programme : traduire en Go, lancer le Go, lancer le TS (`tsx`), comparer les deux affichages **caractère par caractère**.
La référence est le TS **exécuté**, pas une sortie écrite à la main : elle ne peut pas être fausse ou périmée.

## Ce qu'on a décidé
- Programmes testés : les **13 exercices** (00 à 12) **12 variantes** des exercices (`p05fail`…`p11success`) et **4 cas ciblés** (`modulo`, `darray`, `negzero`, `multideclaration`), dans `.commands/output-cases/`.
- Résultat : **29/29 identiques** (3/26 au premier passage, surtout à cause du format d'affichage : voir [10](../10-affichage-identique/)).
- Un **stress test** de 20 programmes pièges (`switch`, `throw`, `typeof`, objets…). Deux issues voulues : traduit avec une sortie identique, ou refusé avec un nom. Résultat : **13 identiques ; 7 non traduits : 5 refus nommés (dont 2 sur une entrée TS invalide) et 2 constructions pas encore prises en charge**.
  - refus voulus : cas 12 (tuple mixte), 13 (méthodes natives), 14 (`throw` / `try`) ;
  - entrée TS invalide, refusée par `un-support-fail-arguments` : cas 11 et 19 (`fail("not-found")`, alors que `fail()` ne prend pas d'argument) ;
  - pas encore pris en charge, sans nom de refus (`notfound-transformer`) : cas 09 (`typeof`) et 16 (déstructuration de tuple dans un `pipe`).
- Le banc est un script versionné : tout le monde lance la même chose avant une fusion.

## Limites
- Le banc vérifie les sorties, pas la performance (voir [01/mesures](../01-unions-et-either/mesures/)).
- Un chemin jamais exécuté par une variante n'est pas vérifié.
- 2 cas du stress test tombent sur `notfound-transformer` au lieu d'un refus nommé.

## Exemples
- [exemples/01-traduction-juste](exemples/01-traduction-juste/) : un programme avec un chemin d'erreur et `Math.round(-2.5)`, traduit juste.
- [exemples/02-traduction-fausse](exemples/02-traduction-fausse/) : le même programme, traduit mot à mot : il compile, passe `go vet`… et affiche autre chose.
- [exemples/compare.sh](exemples/compare.sh) : un mini-banc qui compare les deux au TS.

```bash
bash exemples/compare.sh   # Node 22+, tsx et @duplojs/lang installés
# IDENTIQUE    01-traduction-juste
# DIFFÉRENT    02-traduction-fausse
#              < [ 3, -2, 1 ]
#              > [ 3, -3, 1 ]
```
