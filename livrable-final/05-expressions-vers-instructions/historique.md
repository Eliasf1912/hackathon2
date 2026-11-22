# 05 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | Paire `{ before, result }` (01) | une expression TS peut produire des instructions Go | Go verbeux | **retenue** |
| 2 | Tout calculer dans `before`, même l'opérande droit de `&&`/`\|\|` (01) | simple | casse le court-circuit | **abandonnée** |
| 3 | Calculs conditionnels dans une branche Go (01) | seule la branche choisie s'exécute, comme JS | plus de code | **retenue** |
| 4 | Ternaire → `var` + `if`/`else` (06) | même règle ; pas de fonction créée | verbeux | **retenue** |
| 5 | Ternaire → fonction `Ternary(c, a, b)` (06, déduction) | une ligne | évalue les deux branches | non retenue |
| 6 | `rightPipe` → fonction appelée sur place + `return` (07) | code linéaire ; arrêt anticipé naturel | coût non mesuré | **retenue** |
| 7 | `group` → boucle dans une fonction appelée sur place (09) | longueur connue seulement à l'exécution | coût non mesuré | **retenue** |
| 8 | Laisser en ligne les éléments sans `before` (revue 02-10) | moins de variables | inversait l'ordre JS | **corrigée** |
| 9 | Ranger dans une variable un élément suivi de `before` (revue 02-10) | ordre JS garanti | une variable de plus | **retenue** |
| 10 | `a ?? b` → `if` sur la variante 0 (12) | `b` évalué seulement si besoin | dépend de « `undefined` = variante 0 » | **retenue** |

## Pourquoi ce choix
Une seule règle guide tout : produire en Go le même résultat, avec les mêmes effets, dans le même ordre que JS.
La paire `{ before, result }` permet de sortir des instructions d'une expression.
Mais sortir trop tôt casse le court-circuit, d'où la règle « dans une branche, jamais avant ».
Et sortir les `before` d'un seul élément inverse l'ordre, d'où le rangement dans une variable.
Quand il faut un `return` ou une boucle, la fonction appelée sur place garde le code linéaire.

## Encore ouvert
- Performance des fonctions appelées sur place : non mesurée.
- `bindOnce` ne copie pas un identifiant : à faire si une affectation peut le modifier entre deux lectures.
- `?.` : annoncé dès 01 comme relevant de la même règle, pas encore traduit.

Sources : `docs/01/conceptions.md`, `docs/06/conceptions.md`, `docs/07/conceptions.md`, `docs/09/conceptions.md`, `docs/12/conceptions.md`, `docs/revues/2026-11-19-revue-02-10.md`, `docs/bilan/2026-11-19-bilan-conceptions.md`.
