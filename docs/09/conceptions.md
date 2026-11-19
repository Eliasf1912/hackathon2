# Projet 09 : conception

## Le problème

`projects/09` pose une question (voir son `README.md`) : **regrouper des résultats en une transaction**. `DEither.group` réunit plusieurs résultats `Either` en un seul : la transaction ne réussit que si tous les calculs réussissent, et le premier échec devient celui de la transaction.

```ts
const transaction = DEither.group(calculations);   // calculations : (Left | Left | Success<number>)[]

const display = DEither.whenIsRightOtherwise(
	transaction,
	(values) => DArray.map(values, DString.to),
	() => ["transaction annulée"],
);
```

## Ce que sait le checker

```
group(calculations)  : Left<"division-by-zero", 0> | Left<"negative-operand", number> | Success<number[]>
whenIsRightOtherwise : readonly (string & Number)[] | ["transaction annulée"]   → Union2[[1]string, []string]
```

## Ce que fait DuploJS à l'exécution

Lu dans `dist/either/right/group.mjs` (forme tableau) : les éléments sont parcourus dans l'ordre ; un élément fonction (« getter ») est d'abord appelé ; un Right ajoute sa valeur ; tout le reste (un `Left`) **arrête** le parcours et devient le résultat ; à la fin, `success([valeurs…])`.

## Résultat

Le Go généré affiche **la même sortie** que TS (le troisième calcul divise par zéro) :

```
["transaction annulée"]
```

`pnpm test` : **30 tests sur 30 au vert**, `tsc` et le lint passent, `go vet` propre sur 00 à 09.

```go
Sourced_transaction = func() (Union2[EitherLeft[float64], EitherSuccess[[]float64]]) {
	values := make([]float64, len(Sourced_calculations))
	for index, element := range Sourced_calculations {
		if element.Tag == 0 {
			return (Union2[…]{Tag: 0, V0: element.V0})   // Left : la transaction échoue
		} else {
			values[index] = element.V1.Value             // Success : sa valeur
		}
	}
	return (Union2[…]{Tag: 1, V1: EitherSuccessOf[[]float64](values)})
}()
```

## Les idées utilisées

### 1. Une boucle dans une fonction appelée sur place

Contrairement à `rightPipe` (nombre d'étapes connu à la compilation), la longueur du groupe n'est connue qu'**à l'exécution** : une boucle `for … range`. Comme pour `rightPipe`, une fonction appelée sur place exprime l'arrêt au premier `Left` par un `return`.

Pour chaque élément, une branche par variante de son type (`dispatch.ts`, 07) :
- Right → `values[index] = element.Vi.Value` ;
- autre (`Left`) → `return`, converti vers le type du résultat.

### 2. Le tableau des valeurs est dimensionné une fois

Le type des valeurs vient de la variante `Success` du résultat que donne le checker :
- `Success<number[]>` → `values := make([]float64, len(group))` : une seule allocation, à la bonne taille ;
- groupe littéral (tuple) `Success<[number, number]>` → `var values [2]float64` : aucune allocation (décision de 08).

Dans les deux cas, l'affectation est la même : `values[index] = …`.

### 3. Le reste est déjà là

`whenIsRightOtherwise` (05) avec `(values) => DArray.map(values, DString.to)` et `() => ["transaction annulée"]` n'a demandé aucun ajout : le tuple `["transaction annulée"]` devient `[1]string` (08), le `map` une `[]string`, et l'union des deux une `Union2`.

## Ce qui a été modifié (fichiers existants)

| Fichier | Changement |
|---|---|
| `src/transpiler/transformers/duplojs/either/index.ts` | + `group` |

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `src/transpiler/transformers/duplojs/either/group.ts` | `DEither.group` (forme tableau) |

Tests (locaux) : 09 dans les e2e ; la fixture `either-variants` couvre `group` à l'exécution : tous les éléments réussissent (`[1, 2, 3]`), un `Left` au milieu (arrêt sur `-2`, avant `0`), groupe littéral (tuple → `[2]float64`).

## Limites connues

| Erreur | Cas |
|---|---|
| `un-support-group-object-or-getter` | forme objet `group({ a, b })` (il faudra traduire les objets) ; éléments « getters » (il faudra traduire les types fonction) |
| `un-support-group-as-value` | `group` passé en valeur |

## Questions ouvertes

1. **Getters** : `group([() => calcul(), …])` n'évalue chaque calcul que si les précédents ont réussi (évaluation paresseuse). Il faudra traduire les types fonction (`() => T` → `func() T`) puis appeler l'élément dans la boucle. `asyncGroup` (10) utilise cette forme.
