# Projet 05 : conception

## Le problème

`projects/05` pose deux questions (voir son `README.md`) :

1. **Transformer les différentes issues d'un résultat** : `DEither.whenIsRightOtherwise(f, otherwise)` applique `f` à la valeur d'un Right, et `otherwise` aux autres variantes ;
2. **Transformer chaque élément d'une collection** : `DArray.map(DString.to)` convertit chaque nombre en chaîne, dans l'ordre.

```ts
const newResult = DCommon.pipe(
	result,
	DEither.whenIsRightOtherwise(
		DArray.coalescing,
		() => [-12],            // ne déclare aucun paramètre, mais reçoit le Fail
	),
	DArray.map(DString.to),
);
```

Nouveautés à traduire : une fonction fléchée, un littéral de tableau, `whenIsRightOtherwise`, `DArray.map`, `DString.to`, et les types `string`, `string & Number`, `… & LengthEqual<1>`.

## Ce que sait le checker

```
pipe paramètre 1           : (input: Fail | Success<number>) => [-12] | readonly [number]
pipe paramètre 2           : (input: [-12] | readonly [number]) => readonly (string & Number)[] & LengthEqual<1>
whenIsRightOtherwise param 1 : (value: Fail) => [-12]
DArray.map param 0         : (element: number, params: MapTheFunctionParams<…>) => string & Number
```

`[-12] | readonly [number]` donne deux fois `[]float64` en Go : l'union disparaît (dédoublonnage de 02).

## Résultat

Le Go généré affiche **la même sortie** que TS :

```
{"…/right":null,"…/information":"success","…/value":3,"…/success":null}
["3"]
```

`pnpm test` : **25 tests sur 25 au vert**, `tsc` et le lint passent (hors `projects/11`), `go vet` propre sur 00 à 05.

```go
Generated_6 := shard_dependencies.CoalescingValue[float64]
Generated_8 := func() ([]float64) {                       // () => [-12]
	return ([]float64{-((float64)(12))})
}
Generated_12 := func(Generated_9 Union2[EitherFail, EitherSuccess[float64]]) ([]float64) {
	var Generated_10 []float64
	if Generated_9.Tag == 0 {
		Generated_10 = Generated_8()                       // otherwise, sans argument
	} else {
		Generated_10 = Generated_6(Generated_9.V1.Value)   // f(valeur)
	}
	return Generated_10
}
Generated_7 := shard_dependencies.NumberToString           // DString.to en valeur
Generated_13 := func(Generated_11 []float64) ([]string) { // DArray.map(DString.to)
	return shard_dependencies.Map(Generated_11, Generated_7)
}
Sourced_newResult = Generated_13(Generated_12(Sourced_result))
```

## Les idées utilisées

### 1. Fonctions fléchées → fonctions anonymes Go

`(a) => …` et `function (a) { … }` deviennent `func(a T) R { … }` :
- type d'un paramètre : son annotation, sinon le type que le checker lui donne (souvent déduit du contexte) ;
- type de retour : `transformFunctionReturnType`, comme pour une déclaration de fonction ;
- corps expression (`() => [-12]`) : un `return` de l'expression, convertie vers le type de retour ; corps bloc : le bloc, dont les `return` sont déjà convertis (02).

### 2. JS ignore les arguments en trop, Go non

`() => [-12]` est appelé avec le `Fail`. Deux outils généraux (`shared/functionValue.ts`) :
- `getDeclaredParameterCount` : le nombre de paramètres que la fonction **déclare** (d'après son propre type ; paramètre rest → pas de limite) ;
- à l'appel, `createFunctionValueCall` ne passe que ces arguments-là (`Generated_8()`) ;
- là où Go attend un type de fonction précis (`Map` attend `func(T) R`), `adaptFunctionValue` enveloppe la fonction : `func(_ T) R { return f() }`.

### 3. Littéral de tableau → littéral de slice

`[a, b]` → `[]T{a, b}`, avec `T` d'après le type que le checker donne au littéral (tableau ou tuple homogène). Chaque élément est converti vers `T`.

### 4. Une forme curryfiée : une seule fonction partagée

`createCurriedFunction` (`duplojs/curried.ts`) généralise la closure de 03 : types d'entrée et de sortie lus sur le type de l'appel, et un `apply` qui produit le corps. `whenIsRight`, `whenIsRightOtherwise` et `DArray.map` l'utilisent.

### 5. `whenIsRight` et `whenIsRightOtherwise` : un seul cœur

`applyWhen` reçoit une branche Right et une branche « sinon » facultative :
- variante Right → `right(valeur)` ;
- autre variante → `otherwise(variante)` si elle existe (la variante est d'abord convertie vers le type du paramètre de `otherwise`), sinon la variante telle quelle ;
- chaque branche est convertie vers le type de sortie.

Les fonctions sont évaluées une fois, avant tout appel. Une fonction jamais appelée (aucune variante concernée) reçoit un `_ = f` pour que Go compile, et reste évaluée comme en JS.

### 6. `DArray.map` → fonction partagée `Map[T, R]`

```go
func Map[T any, R any](array []T, theFunction func(T) R) []R {
	result := make([]R, len(array))       // taille connue : une seule allocation
	for index, element := range array {
		result[index] = theFunction(element)
	}
	return result
}
```

Même longueur, même ordre. Formes directe et curryfiée. Le type renvoyé par `f` doit être exactement l'élément de sortie (sinon erreur nommée).

### 7. `DString.to` : la conversion est choisie à la compilation

En JS, `` `${value}` `` dépend du type à l'exécution. Ici le type est connu :
- `float64` → `shard_dependencies.NumberToString` ;
- `string` → la valeur telle quelle.

`NumberToString` reproduit l'écriture JS des nombres :

```go
func NumberToString(value float64) string {
	if value == 0 { return "0" }                    // aussi -0
	if math.IsNaN(value) { return "NaN" }
	if math.IsInf(value, 1) { return "Infinity" }
	if math.IsInf(value, -1) { return "-Infinity" }
	absolute := math.Abs(value)
	if absolute >= 1e-6 && absolute < 1e21 {
		return strconv.FormatFloat(value, 'f', -1, 64)
	}
	return strings.Replace(strconv.FormatFloat(value, 'e', -1, 64), "e-0", "e-", 1)
}
```

JS et Go écrivent tous deux le **plus petit nombre de chiffres** qui redonne la même valeur. JS passe en notation exponentielle hors de [1e-6, 1e21[, avec un exposant sans zéro de tête (`1e-7` ; Go écrit `1e-07`). Vérifié contre JS sur `0`, `-0`, `0.1`, `1/3`, `1e21`, `1e-6`, `1e-7`, `2**53+1`, `-1e300`, `5e-324`, `±Infinity`, `NaN`.

### 8. Types : `string`, gabarits, intersections

- `string` et type gabarit (`` `${string}@${string}` ``) → `string` ;
- intersection : les **contraintes DuploJS** sont retirées (elles sont toutes déclarées dans `dist/<domaine>/constraints/` : `Number`, `Positive`, `LengthEqual`…), il doit rester exactement un type. `readonly (string & Number)[] & LengthEqual<1>` → `[]string`.

## Ce qui a été modifié (fichiers existants)

| Fichier | Changement |
|---|---|
| `src/transpiler/transformers/duplojs/either/whenIsRight.ts` | réécrit : cœur `applyWhen` (branche « sinon » facultative), formes directe et curryfiée pour `whenIsRight` et `whenIsRightOtherwise` |
| `src/transpiler/transformers/duplojs/either/index.ts` | + `whenIsRightOtherwise` |
| `src/transpiler/transformers/duplojs/array/index.ts` | + `map` |
| `src/transpiler/transformers/duplojs/index.ts` | + domaine `string` |
| `src/transpiler/transformers/expression/index.ts` | + littéral de tableau, + fonctions anonymes |
| `src/transpiler/transformers/type/index.ts` | + `string`, + intersection |
| `src/transpiler/transformers/shared/index.ts` | + `functionValue` |

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `src/transpiler/transformers/expression/function.ts` | fonction fléchée / expression de fonction → `func(…) R { … }` |
| `src/transpiler/transformers/expression/array.ts` | `[a, b]` → `[]T{a, b}` |
| `src/transpiler/transformers/shared/functionValue.ts` | nombre de paramètres déclarés, appel limité, adaptation |
| `src/transpiler/transformers/duplojs/curried.ts` | closure d'une forme curryfiée |
| `src/transpiler/transformers/duplojs/array/map/` | `DArray.map` + `Map[T, R]` |
| `src/transpiler/transformers/duplojs/string/` | domaine `DString` ; `to` + `NumberToString` |
| `src/transpiler/transformers/type/string.ts` | `string`, types gabarits |
| `src/transpiler/transformers/type/intersection.ts` | intersections avec contraintes DuploJS |

Tests (locaux) : 05 dans les e2e ; nouvelle fixture `functions-runtime` (`tests/transpiler/functionsRuntime.test.ts`) comparée à TS à l'exécution : `NumberToString` sur 17 nombres, `whenIsRightOtherwise` sur `Fail` et `Success`, direct et curryfié, `map` avec fonctions à 0 et 1 paramètre, corps expression et bloc, `map` curryfié dans `pipe`.

## Limites connues

| Erreur | Cas |
|---|---|
| `un-support-map-index-params` | fonction de `map` qui utilise son 2ᵉ paramètre (`{ index, self }`) : il faudra traduire un objet |
| `un-support-map-element-conversion` | `f` renvoie un membre d'une union attendue en sortie (conversion de slice non faite) |
| `un-support-array-spread` | `[...a, b]` |
| `un-support-to-value-type` | `DString.to` sur booléen, `null`, `undefined`, objet |
| `un-support-generator-function` | `function*` |
| `params-name-is-not-identifier` | paramètre déstructuré `([a, b]) => …` (exercice 08) |

## Questions ouvertes

1. **Closures et performance.** `Map` reçoit une fonction : Go peut l'inliner si `Map` et la fonction sont petites, mais pas toujours. Une boucle écrite sur place serait plus rapide ; à mesurer.
2. **`json.Marshal` échappe `<`, `>` et `&`** (`<`) alors que `JSON.stringify` non : une chaîne qui en contient s'afficherait différemment dans `print`.
