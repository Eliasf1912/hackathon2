# Projet 08 : conception

## Le problème

`projects/08` pose trois questions (voir son `README.md`) :

1. **Traiter une collection de calculs** : `DArray.map` produit un résultat `Either` par entrée, puis un second `map` les rend affichables selon leur issue ;
2. **Représenter un tableau de tuples** `[number, number, number][]` **sans perdre sa cardinalité** ni le rôle de chaque position ;
3. **Déconstruire un tuple dans un paramètre** : `([one, two, divisor]) => …`, forme que Go n'a pas.

```ts
const inputs: [number, number, number][] = [[1, 2, 1], [4, 5, 3], [2, 3, 0]];

const calculations = DArray.map(
	inputs,
	([one, two, divisor]) => DEither.rightPipe(add(one, two), (value) => divide(value, divisor)),
);

const display = DCommon.pipe(
	calculations,
	DArray.map(DEither.whenIsRightOtherwise(DString.to, () => "échec")),
);
```

## Décision : un tuple devient un tableau Go `[N]T`

Depuis 02, un tuple homogène devenait une slice `[]T` (« shortcut » : TS vérifie déjà la longueur). Deux options ont été proposées :

| Option | Pour | Contre |
|---|---|---|
| **tableau Go `[N]T`** (retenue) | la cardinalité est dans le type Go ; une valeur, sans allocation sur le tas (objectif performance) | passer un tuple là où `T[]` est attendu demande une conversion ; `coalescing` et `map` à adapter |
| slice `[]T` | aucun changement | une allocation par tuple ; la longueur n'est plus visible en Go |

Le rôle de chaque position reste porté par les noms de la déstructuration (`one`, `two`, `divisor`).

## Résultat

Le Go généré affiche **la même sortie** que TS :

```
["3","3","échec"]
```

`pnpm test` : **29 tests sur 29 au vert**, `tsc` et le lint passent, `go vet` propre sur 00 à 08.

```go
var Sourced_inputs [][3]float64

Sourced_inputs = ([][3]float64{
	([3]float64{ (float64)(1), (float64)(2), (float64)(1) }),
	…
})
Generated_12 := func(Generated_1 [3]float64) (Union2[EitherLeft[float64], EitherSuccess[float64]]) {
	Sourced_one := Generated_1[0]        // ([one, two, divisor]) : liaison par position
	Sourced_two := Generated_1[1]
	Sourced_divisor := Generated_1[2]
	…                                     // rightPipe (07)
}
Sourced_calculations = shard_dependencies.Map(Sourced_inputs, Generated_12)
```

## Les idées utilisées

### 1. Tuple homogène → `[N]T`, littéral → `[N]T{…}`

- type : `[number, number, number]` → `[3]float64` ; tableau de tuples → `[][3]float64` ;
- littéral : le type que le checker donne au littéral décide entre `[]T{…}` (tableau TS) et `[N]T{…}` (tuple) ;
- un tuple hétérogène, vide, ou à éléments optionnels / rest reste une erreur nommée (« shortcut » : à traduire en struct `TupleN[T0…]` avec un `MarshalJSON` en tableau JSON quand un exercice en aura besoin).

Le JSON d'un tableau Go est un tableau JSON : `print` ne change pas.

### 2. Ce qui produit ou consomme des tuples a été adapté

- `DArray.coalescing(valeur)` est un tuple `readonly [T]` : `CoalescingValue[T]` renvoie maintenant `[1]T` ;
- `CoalescingArray[A]` est devenue une **identité générique sur le type entier** : elle vaut pour une slice comme pour un tableau `[N]T` (Go ne peut pas être générique sur la longueur `N`) ;
- `DArray.map` sur un tableau `[N]T` le passe à `Map` comme slice, **sans copie** : `x[:]` (`x` est toujours une variable, donc adressable).

### 3. Déstructuration d'un paramètre

`([one, two, divisor]) => …` : le paramètre Go reçoit un nom généré, puis chaque nom est lié par position au début du corps :

```go
func(p [3]float64) R {
	one := p[0]
	two := p[1]
	divisor := p[2]
	…
}
```

Un élément omis (`[, second]`) est ignoré. Le même accès `p[i]` vaut pour un tableau et une slice.

**Piège TS 7** : un élément omis n'y est pas une `OmittedExpression`, mais un `BindingElement` sans nom.

### 4. `map` de fonctions composées

`DArray.map(DEither.whenIsRightOtherwise(DString.to, () => "échec"))` n'a demandé aucun ajout : la forme curryfiée de `whenIsRightOtherwise` (05) est une closure typée par le contexte (`map`), passée à la forme curryfiée de `map`.

## Ce qui a été modifié (fichiers existants)

| Fichier | Changement |
|---|---|
| `src/transpiler/transformers/type/array.ts` | tuple homogène → `[N]T` (au lieu de `[]T`) |
| `src/transpiler/transformers/expression/array.ts` | littéral de tuple → `[N]T{…}` |
| `src/transpiler/transformers/duplojs/array/coalescing/` | `CoalescingValue` → `[1]T` ; `CoalescingArray[A]` identité générique |
| `src/transpiler/transformers/duplojs/array/map/index.ts` | tableau `[N]T` passé comme slice `x[:]` |
| `src/transpiler/transformers/expression/function.ts` | paramètre déstructuré `[a, , b]` |

Tests (locaux) : 08 dans les e2e ; la fixture `functions-runtime` couvre les tuples à l'exécution : `[number, number][]`, déstructuration complète et avec élément omis, `coalescing` sur un tableau (branche `CoalescingArray`, enfin testée) et sur une valeur, `map` sur un tuple, `pipe` qui enchaîne `coalescing` et `map`.

## Limites connues

| Erreur | Cas |
|---|---|
| `un-support-heterogeneous-or-empty-tuple` | `[number, string]`, `[]`, `[number, ...number[]]`, `[number?]` |
| `un-support-type-conversion` | tuple `[N]T` passé là où `T[]` est attendu (la conversion n'est pas encore écrite : aucun exercice n'en a besoin) |
| `un-support-binding-element` | déstructuration imbriquée, valeur par défaut, reste `[...a]` |
| `params-name-is-not-identifier` | déstructuration d'objet `({ a }) => …` |
| (Go) | un nom déstructuré jamais utilisé : Go refuse les variables locales inutilisées |

## Questions ouvertes

1. **Conversion tuple → tableau TS.** `x[:]` ne marche que sur une variable ; pour une expression quelconque, il faudra la ranger d'abord (un `before`, que `convertToType` ne sait pas encore produire).
2. **Aliasing** : en JS, un tuple passé à une fonction est le même objet ; en Go, un tableau est copié. Sans effet tant que les tuples sont `readonly` (cas de DuploJS), mais à garder en tête pour les mutations.
