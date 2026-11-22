# 08 · Les nombres

**Le problème :** en JS, tout `number` est un décimal (IEEE 754). Go a plusieurs types numériques, et ses opérateurs n'ont pas toujours le sens de JS.

## Pourquoi c'est difficile
Les écarts sont **silencieux** : le Go compile, tourne, et affiche autre chose.
- `%` n'existe pas sur les décimaux en Go.
- `-0` disparaît : une constante Go n'a pas de zéro négatif.
- `Math.round(-2.5)` vaut `-2` en JS, `math.Round(-2.5)` vaut `-3` en Go.
- Un nombre écrit en texte n'a pas la même forme (`1e-7` en JS, `1e-07` en Go).

## L'idée
`number` → `float64` (même norme que JS). Puis, pour chaque opérateur, **la fonction Go qui a le sens de JS** :

| TS | Go | Résultat |
|---|---|---|
| `-7 % 3` | `math.Mod(-7, 3)` | `-1`, comme JS |
| `-0` | `math.Copysign(0, -1)` | `-0`, calculé à l'exécution |
| `Math.round(x)` | `math.Floor(x + 0.5)` | et non `math.Round` |
| `DString.to(x)` | `NumberToString(x)` | forme JS : `1e21`, `1e-7`, `-0` → `"0"` |

## Ce qu'on a décidé
- Toujours `float64(1)`, jamais `1` seul : sinon Go en fait un `int`.
- Les opérandes passent par des variables : une constante Go est calculée en précision exacte (`0.1 + 0.2` vaudrait `0.3`).
- Les opérateurs sur les bits (`&`, `<<`…) sont **refusés** (voir [12](../12-refus-stricts/)).

## Limites
- `DNumber.Int` pourrait donner un `int64` plus rapide, mais le débordement d'un entier Go ne suit pas JS : piste non suivie.
- `BigInt` et opérateurs sur les bits : refusés.

## Exemples
- [exemples/01-operateurs-comme-js](exemples/01-operateurs-comme-js/) : modulo, `-0`, arrondi, avec à côté la traduction naïve qui ment.
- [exemples/02-ecrire-un-nombre](exemples/02-ecrire-un-nombre/) : `NumberToString` contre `strconv.FormatFloat`, et `0.1 + 0.2`.
