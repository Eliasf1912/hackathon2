# Projet 06 : conception

## Le problème

`projects/06` pose deux questions (voir son `README.md`) :

1. **Représenter et traiter des erreurs identifiées** : `add` renvoie `DEither.left("negative-operand", valeur)`, une erreur qui porte une information et une valeur. `DEither.matchInformation` choisit ensuite un traitement selon l'information ;
2. **Traduire une expression ternaire** : `one < 0 ? one : two`, alors que Go n'a pas d'opérateur ternaire.

```ts
// add.ts
if (one < 0 || two < 0) {
	return DEither.left("negative-operand", one < 0 ? one : two);
}
return DEither.success(one + two);

// index.ts
const message = DEither.matchInformation(result, {
	"negative-operand": () => "un opérande est négatif",
	success: (value) => DString.to(value),
});
```

## Ce que sait le checker

```
add(…)                     : Left<"negative-operand", number> | Success<number>
one < 0 ? one : two        : number
matchInformation(…)        : string | (string & Number)       → string en Go
matcher                    : { "negative-operand": () => string; success: (value: number) => string & Number }
```

## Résultat

Le Go généré affiche **la même sortie** que TS (`add(-1, 2)` : la branche `Left`) :

```
["-12"]
"un opérande est négatif"
```

`pnpm test` : **27 tests sur 27 au vert**, `tsc` et le lint passent, `go vet` propre sur 00 à 06.

```go
// add.ts
var Generated_34 float64
if Generated_32 < Generated_33 {                 // le ternaire
	Generated_34 = Sourced_one
} else {
	Generated_34 = Sourced_two
}
return (Union2[EitherLeft[float64], EitherSuccess[float64]]{
	Tag: 0,
	V0: Generated_31(Generated_35, Generated_34), // EitherLeftOf[float64]("negative-operand", …)
})

// index.ts : matchInformation
var Generated_16 string
if Sourced_result.Tag == 0 {
	Generated_16 = Generated_14()                     // "negative-operand"
} else {
	Generated_16 = Generated_15(Sourced_result.V1.Value) // success
}
```

## Les idées utilisées

### 1. Les variantes `Left`, `Right`, `Error` : des structs génériques

Comme `EitherSuccess`, chaque variante qui porte une valeur devient une struct générique, avec la forme JSON de DuploJS (vérifiée avec `JSON.stringify`) :

| TS | Go | JSON |
|---|---|---|
| `Left<I, T>` | `EitherLeft[T]` | `left`, `information`, `value` |
| `Right<I, T>` | `EitherRight[T]` | `right`, `information`, `value` |
| `Error<T>` | `EitherError[T]` | `left`, `information: "error"`, `value`, `error` |

Une seule fabrique (`either/variant/sharedDependency.ts`) produit la struct, le constructeur (`EitherLeftOf[T](information, value)`) et la méthode `IsRight()`.

**L'information n'est pas dans le type Go** : `Left<"a", number>` et `Left<"b", number>` deviennent tous deux `EitherLeft[float64]`, donc la même variante de l'union (dédoublonnage de 02). L'information reste une valeur, lue à l'exécution quand il faut les distinguer.

### 2. Le registre des variantes connaît leurs genres

Le registre de 02 ne répondait qu'à « est-ce un Right ? ». Chaque variante y déclare maintenant :
- ses **genres** DuploJS : `EitherError` est un `left` et un `error`, `EitherSuccess` un `right` et un `success` ;
- son **information** quand elle est fixe (`"success"`, `"fail"`, `"error"`) ;
- si elle porte une **valeur** (champ `Value`).

C'est le point 2 relevé lors de l'analyse de 11 : `isLeft`, `isError`… pourront s'appuyer dessus.

### 3. `matchInformation` : une branche par variante

Pour chaque variante de l'entrée :
- **pas un Either** : renvoyée telle quelle (comme DuploJS à l'exécution) ;
- **information fixe** (`Success`) : son gestionnaire est choisi **à la compilation** ;
- **`Left` / `Right` génériques** : les gestionnaires candidats sont ceux dont le paramètre a le type de la valeur, sauf les informations déjà fixées par une autre variante de l'union (`"success"`). Un seul candidat : appel direct ; plusieurs : test `variante.Information == "clé"` à l'exécution.

Le matcher doit être un objet littéral ; ses fonctions sont évaluées une fois, dans l'ordre. Un gestionnaire jamais appelé reçoit `_ = h` pour que Go compile. Formes directe et curryfiée.

**Piège découvert** : `DEither.fail()` porte bien une valeur en JS, `undefined` (absente du JSON car `JSON.stringify` omet `undefined`). `matchInformation` appelle donc `matcher.fail(undefined)` et plante si la clé manque. En Go, le gestionnaire `fail` reçoit `JSUndefined{}`.

### 4. Le ternaire : une variable remplie dans un `if`

```go
var out T                  // T : type que le checker donne au ternaire
if condition { out = a } else { out = b }
```

Les calculs préalables de chaque branche restent **dans** leur branche : seule la branche choisie est évaluée, comme en JS (règle 3 de 01). La condition doit être booléenne, comme pour `if`.

### 5. Ajouts généraux

- **`null` / `undefined`** (valeurs et types) → `JSNull{}` / `JSUndefined{}` ;
- **gabarits de chaîne** `` `a ${x}` `` → `"a " + texte(x)`, avec la conversion de `DString.to` (partagée : `createToStringExpression`) ;
- **dépendances partagées dédoublonnées** : une dépendance par défaut (`JSNull`) peut aussi être enregistrée par un transformer.

## Ce qui a été modifié (fichiers existants)

| Fichier | Changement |
|---|---|
| `src/transpiler/transformers/duplojs/either/sharedDependency.ts` | registre des variantes : genres, information fixe, présence d'une valeur |
| `src/transpiler/transformers/duplojs/either/success/sharedDependency.ts` | déclaration dans le nouveau registre |
| `src/transpiler/transformers/duplojs/either/fail/sharedDependency.ts` | déclaration dans le nouveau registre |
| `src/transpiler/transformers/duplojs/either/index.ts` | + `left`, `right`, `error`, `matchInformation` ; types `Left`, `Right`, `Error` |
| `src/transpiler/transformers/duplojs/string/to/index.ts` | `createToStringExpression` partagée |
| `src/transpiler/transformers/expression/index.ts` | + ternaire, gabarits, `null` / `undefined` |
| `src/transpiler/transformers/type/index.ts` | + types `null` / `undefined` |
| `src/transpiler/build.ts` | dépendances partagées dédoublonnées |

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `src/transpiler/transformers/duplojs/either/variant/` | `Left`, `Right`, `Error` : struct, constructeur, types et expressions |
| `src/transpiler/transformers/duplojs/either/matchInformation.ts` | `DEither.matchInformation` |
| `src/transpiler/transformers/expression/conditional.ts` | ternaire |
| `src/transpiler/transformers/expression/template.ts` | gabarits de chaîne |
| `src/transpiler/transformers/expression/nullish.ts` | `null`, `undefined` |
| `src/transpiler/transformers/type/nullish.ts` | types `null`, `undefined` |

Tests (locaux) : 06 dans les e2e ; nouvelle fixture `either-variants` comparée à TS à l'exécution : ternaire avec calcul préalable dans une branche, `left` / `right` / `error`, `Fail`, deux `Left` de même type distingués par leur information, `matchInformation` direct et curryfié (dans `pipe`), gestionnaire `fail`, gabarits de chaîne.

## Limites connues

| Erreur | Cas |
|---|---|
| `un-support-either-variant-without-value-type` | `DEither.left("x")` sans valeur : `Left<"x", undefined>` demande un champ `value` omis du JSON (`omitzero` ne convient pas : il omettrait aussi `0`) |
| `un-support-matcher-not-object-literal` | matcher rangé dans une variable |
| `un-support-matcher-property` | méthode (`success() {}`) ou propagation (`...m`) dans le matcher |
| `un-support-template-value-type` | gabarit avec un booléen, un objet… |

## Questions ouvertes

1. **TS ne protège pas toujours `matchInformation`** : un matcher curryfié rangé seul dans une constante n'est pas vérifié (TS ne peut pas inférer l'entrée), et JS plante à l'exécution si une clé manque. En Go, l'absence de gestionnaire est une erreur de transpilation.
2. **Valeur `undefined` dans le JSON** : DuploJS omet la clé `value` quand elle vaut `undefined`. Pour `Left<"x", undefined>`, il faudra un `MarshalJSON` qui omet ce champ selon son type, pas selon sa valeur.
