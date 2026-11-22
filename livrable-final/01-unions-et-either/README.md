# 01 · Unions et Either

**Le problème :** traduire en Go une valeur « soit A, soit B » (`Success<number> | Fail`), sans `any`, alors que tout DuploJS repose sur ces Either.

## Pourquoi c'est difficile
TypeScript accepte `A | B` pour n'importe quels types. Go n'a pas de type « soit… soit… » utilisable comme valeur.
Une interface Go marche, mais coûte une allocation par appel. Or le but du projet est la performance.

## L'idée
Une union devient une **boîte à cases** : une case par membre (`V0`, `V1`…). Une **étiquette `Tag`** dit quelle case lire.
La boîte est une valeur, pas un pointeur : aucune allocation. `isRight(x)` devient `x.Tag == 1`.
`Success<number> | Fail` → `Union2[EitherFail, EitherSuccess[float64]]` = `struct { Tag uint8; V0 EitherFail; V1 EitherSuccess[float64] }`

## Ce qu'on a décidé
- Une struct générique par nombre de cases (`Union2`, `Union3`…), déclarée une seule fois.
- Une seule forme par union : membres dédoublonnés, triés (`A | B` = `B | A`), `undefined` toujours en case 0.
- On emballe la valeur là où TS connaît le type attendu (`return`, variable annotée, argument) : `Union2{Tag: 1, V1: v}`.

## Mesures
Deux mesures, chacune compare deux pistes sur le même calcul :

| Ce qui est comparé | Résultat | Source |
|---|---|---|
| Go généré de l'exercice 01 : interface `Either` contre struct concrète | ~45 ns et 1 allocation contre ~3,3 ns et 0 (environ ×13) | mesuré à l'exercice 01, sur une ancienne version : l'interface n'existe plus dans `develop` et le programme de mesure n'a pas été conservé |
| `Union2` contre conteneur `Value any` (banc [mesures/](mesures/)) | ~3,4 à 4,2 ns et 0 allocation contre ~12 à 13,5 ns et 1 allocation (environ ×3) | relancé le 20/11, [mesures/resultats.txt](mesures/resultats.txt) |

Ce sont des micro-mesures : elles justifient le choix, elles ne prédisent pas le gain sur un programme entier.

## Limites
- La boîte contient toutes les cases : sa taille est la somme des tailles. Coût non mesuré à 3 ou 5 cases.
- Un registre global donne le genre de chaque variante (`left`, `right`…). Une variante oubliée dans ce registre ne serait ni Left ni Right : `isRight` et `isLeft` renverraient tous deux `false`.

## Exemples
- [exemples/01-interface-ou-union-taguee](exemples/01-interface-ou-union-taguee/) : interface contre `Union2`, avec la mesure des allocations.
- [exemples/02-union-canonique](exemples/02-union-canonique/) : dédoublonnage, tri, `undefined` en case 0.
