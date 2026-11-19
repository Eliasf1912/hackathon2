# Projet 01 : conception

## Le problème

`projects/01` pose deux questions (voir son `README.md`) :

1. **Représenter un retour composé de plusieurs variantes** : `add` déclare `DEither.Success<number> | DEither.Fail`. Comment le représenter en Go en conservant le type et la valeur de chaque variante ?
2. **Traduire une instruction conditionnelle** : `if (DEither.isRight(result)) { … }`, en préservant l'évaluation de la condition et l'exécution de la bonne branche.

```ts
// add.ts
export function add(one: number, two: number): (DEither.Success<number> | DEither.Fail) {
	return DEither.success(one + two);
}

// index.ts
const result = add(1, 2);
if (DEither.isRight(result)) {
	DCommon.print(result);
}
```

Pour que le programme tourne, il fallait aussi traduire `const result = …` et `DCommon.print`.

## Résultat

Le Go généré affiche **la même valeur** que le programme TS (comparée en JSON) :

```json
{"@duplojs/lang/kind/@DuplojsLangEither/right":null,"@duplojs/lang/kind/@DuplojsLangEither/information":"success","@duplojs/lang/kind/@DuplojsLangEither/value":3,"@duplojs/lang/kind/@DuplojsLangEither/success":null}
```

`pnpm test` : **18 tests sur 18 au vert** (projets 00 et 01 + 6 fixtures), `tsc` et le lint passent.

Go généré pour `index.ts` :

```go
var Sourced_result shard_dependencies.Either

func init() {
	Generated_2 := (float64)(1)
	Generated_3 := (float64)(2)
	Sourced_result = …add001ats.Sourced_add(Generated_2, Generated_3)
	if Sourced_result.IsRight() {
		Generated_5 := Sourced_result
		shard_dependencies.Print(Generated_5)
	}
}
```

## Les idées utilisées

### 1. Toujours une solution générale

Aucune pièce n'est propre à 01. Pour chaque problème, la question a été « comment traduire **ce type de construction dans n'importe quel programme** ? ». Chaque pièce a sa **fixture** (un petit programme TS ciblé) qui la teste indépendamment de 01.

### 2. TypeScript a déjà prouvé les types

Le type checker TS a déjà vérifié le programme : Go n'a pas à refaire cette preuve. Conséquences :
- une union d'Either n'a pas besoin d'une interface Go « scellée » qui interdirait les autres variantes. TS garantit déjà que seules les variantes déclarées apparaissent ;
- le transpiler interroge le checker pour connaître le type d'une valeur à un endroit donné (type d'une variable, type de retour d'un appel, type d'une condition).

### 3. Un calcul conditionnel produit des calculs préalables conditionnels

Le transpiler évalue chaque sous-expression dans une variable **avant** de l'utiliser (`before` / `result`). C'était faux pour `&&` et `||` : l'opérande droit était **toujours** calculé, ce qui cassait le court-circuit (`x !== undefined && x.foo()`).

Règle générale : les calculs préalables d'une partie évaluée **sous condition** vont **dans une branche Go**, jamais avant. Appliquée à :
- `&&` / `||` : `if gauche { … }` / `if !gauche { … }` ;
- `else if` : les calculs de sa condition vont **dans le `else`**.

Elle servira aussi pour le ternaire, `??` et `?.`.

### 4. Variables de module : `var` au niveau du package + affectation dans `init()`

Un `const` de module doit être visible par les fonctions du fichier et par les autres fichiers (`export const`). Une variable déclarée dans `init()` ne le serait pas. Donc :
- `var Sourced_x <type>` au **niveau du package**, avec le type donné par le checker (un type littéral comme `10` est élargi en `number`, donc `float64`) ;
- `Sourced_x = valeur` dans `init()`, avec ses calculs préalables, dans l'ordre du source.

`transformSourceFile` n'a pas eu besoin d'être modifié : sa règle (déclaration → package, `before` → `init()`) produit exactement cette forme. Une variable **locale** devient `Sourced_x := valeur`.

### 5. Unions d'Either → interface `Either`

Go n'a pas de type « soit… soit… », et la règle de performance interdit `any`. Choix :
- toutes les variantes d'Either implémentent une interface commune :
  ```go
  type Either interface {
  	IsRight() bool
  	EitherInformation() string   // pas "Information" : conflit avec le champ du même nom
  }
  ```
- **toute** union dont les membres sont des Either devient `shard_dependencies.Either`, partout. Pas besoin d'inventer un nom par union ;
- chaque variante garde sa struct et sa forme JSON DuploJS : `EitherSuccess[T]` (`right`, `information`, `value`, `success`) et `EitherFail` (`left`, `information: "fail"`, `fail`, sans `value`) ;
- une union qui contient autre chose qu'un Either n'est pas traitée par ce mécanisme. Elle reste une erreur `notfound-transformer UnionType` explicite.

⚠️ **Coût mesuré** (voir « Questions ouvertes ») : environ ×13 et une allocation par appel. Ce choix n'est pas définitif.

### 6. `DEither.isRight(x)` → `x.IsRight()`

Un **appel de méthode** plutôt qu'une fonction générique : il marche pour toute variante et toute union d'Either, sans test de type par variante ni instanciation générique.

### 7. Appel direct des références simples

Le transpiler rangeait **toujours** la fonction appelée dans une variable (`Generated_N := f`, puis `Generated_N(…)`). Or Go refuse de ranger une fonction **générique** dans une variable sans l'instancier, mais **déduit lui-même** ses types quand on l'appelle directement.

Règle : si la fonction appelée est une **référence simple** (`f` ou `pkg.F`, sans calcul préalable), elle est appelée directement. La lire n'a pas d'effet de bord, donc l'ordre d'évaluation est préservé. Ça règle `Print` et tous les génériques futurs dont les types se déduisent des arguments.

### 8. Un type littéral se traduit par le type de sa valeur

DuploJS conserve souvent les types littéraux (`DEither.success(2)` est un `Success<2>`). En Go, la valeur reste un `float64` / `string` / `bool`.

### 9. Des limites explicites plutôt que des contournements

Ce qui n'est pas encore géré produit une **erreur nommée**, jamais un résultat silencieusement faux (voir « Limites connues »).

## Ce qui a été modifié (fichiers existants)

| Fichier | Avant | Après |
|---|---|---|
| `src/transpiler/transformers/expression/binary.ts` | les deux opérandes calculés avant l'opération, y compris pour `&&` / `\|\|` | `logicalExpressionHandler` : opérande droit calculé dans un `if` (ou laissé dans l'expression s'il n'a pas de calcul préalable) |
| `src/transpiler/transformers/shared/call.ts` | fonction appelée toujours rangée dans une variable temporaire | référence simple (`f`, `pkg.F`) appelée directement (`isSimpleReference`) |
| `src/transpiler/transformers/duplojs/either/index.ts` | seulement `success` et le type `Success` | + `isRight`, + type `Fail`, + unions d'Either |
| `src/transpiler/transformers/duplojs/either/success/sharedDependency.ts` | `EitherSuccess` était un **alias** de type | **définition** de type (Go n'accepte pas de méthodes sur un alias générique) + méthodes `IsRight()` / `EitherInformation()` |
| `src/transpiler/transformers/duplojs/index.ts` | domaine Either seulement | + domaine `common` |
| `src/transpiler/transformers/statement/index.ts` | `block`, `return`, appel | + `variable`, + `if` |
| `src/transpiler/transformers/expression/index.ts` | identifiant, nombre, binaire, appel | + chaîne, + booléen |
| `src/transpiler/transformers/type/index.ts` | `number`, `Success<T>` | + `boolean`, + types littéraux, + parenthèses |
| `package.json` | — | `vitest` 5.0.1 + scripts `test`, `test:watch` |
| `tsconfig.app.json` | `src/`, `bin/` | + `tests/` (résolution des alias et vérification de types des tests) |

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `src/transpiler/transformers/statement/variable.ts` | `const` / `let` : variable de module ou locale |
| `src/transpiler/transformers/statement/if.ts` | `if` / `else` / `else if`, branche non-bloc enveloppée, condition booléenne exigée |
| `src/transpiler/transformers/duplojs/either/sharedDependency.ts` | interface Go `Either` + fabrique des méthodes `IsRight()` / `EitherInformation()` |
| `src/transpiler/transformers/duplojs/either/union.ts` | unions d'Either → `shard_dependencies.Either` |
| `src/transpiler/transformers/duplojs/either/isRight.ts` | `DEither.isRight(x)` → `x.IsRight()` |
| `src/transpiler/transformers/duplojs/either/fail/` | variante `EitherFail` (struct + méthodes) et type `DEither.Fail` |
| `src/transpiler/transformers/duplojs/common/` | domaine `DCommon` : `print` → `shard_dependencies.Print[T any]` (affiche le JSON, renvoie la valeur) |
| `src/transpiler/transformers/type/boolean.ts` | `boolean` → `bool` |
| `src/transpiler/transformers/type/literal.ts` | type littéral → `float64` / `string` / `bool` |
| `src/transpiler/transformers/type/parenthesized.ts` | `( T )` → `T` |
| `src/transpiler/transformers/expression/literal.ts` | chaînes et `true` / `false` |
| `vitest.config.ts` | configuration des tests |
| `tests/e2e/` | test de bout en bout par projet : sortie TS (oracle) = sortie Go |
| `tests/transpiler/` + `tests/fixtures/` | tests par fixture : `logical-short-circuit`, `variables`, `either-union`, `if-statement`, `if-non-boolean-condition` (erreur attendue), `call-expression`, `print` |

`tests/` est ignoré par git (règle ajoutée dans `.gitignore`) : les tests sont locaux.

## Ce qui a été supprimé

Aucun fichier n'a été supprimé. Trois comportements ont disparu du Go généré :
- **l'alias de type** `type EitherSuccess[T any] = struct{…}`, remplacé par une définition de type ;
- **l'évaluation systématique de l'opérande droit** de `&&` / `||` (c'était un bug) ;
- **la variable temporaire** pour une fonction appelée par une référence simple (`Generated_N := f`).

## Limites connues (erreurs explicites)

| Erreur | Cas |
|---|---|
| `un-support-non-boolean-condition` | `if (value)` sur un nombre, une chaîne… (« truthiness » JS) |
| `un-support-multiple-variable-declarations` | `const a = 1, b = 2;` |
| `un-support-variable-destructuring` | `const [a, b] = …`, `const { a } = …` (exercice 08) |
| `un-support-local-variable-without-initializer` | `let x;` dans une fonction |
| `un-support-isRight-as-value` | `DArray.filter(list, DEither.isRight)` |
| `un-support-print-params` | second paramètre de `DCommon.print` |
| `notfound-transformer UnionType` | union qui ne contient pas que des Either |
| panique de `Print` | NaN et ±Infinity : `json.Marshal` les refuse, alors que `JSON.stringify` les écrit `null` |

## Questions ouvertes

1. **Coût de l'interface `Either` (mesuré).** Benchmark sur le code généré (`//go:noinline`) :
   ```
   retour d'une union via interface Either   ~45 ns/op   32 B/op   1 allocation
   retour de la struct concrète              ~3,3 ns/op   0 B/op   0 allocation
   ```
   Environ **×13 et une allocation par appel**. Or, en DuploJS, toute fonction qui peut échouer renvoie un Either. Piste : une **struct d'union étiquetée** par forme d'union (valeur, sans allocation, sans `any`), avec `IsRight()` comme test d'étiquette et un `MarshalJSON` généré. Le prix serait un type Go par forme d'union, avec un nom canonique, et une taille qui grandit avec le nombre de variantes. À mesurer à 2, 3 et 5 variantes avant de décider.
2. **Narrowing** (nécessaire dès l'exercice 02). Dans `if (isRight(result))`, TS sait que `result` est un `Success<number>`. Pour lire sa valeur en Go, il faudra une assertion vers le type que le checker donne **à cet endroit**. C'est le même mécanisme que la stratégie de repli « `any` guidé par TS ».
3. **Ordre d'initialisation des modules.** Go initialise les packages « frères » par **ordre alphabétique du chemin d'import** (vérifié), pas dans l'ordre des `import` TS. Aucun exercice n'y est sensible aujourd'hui.
4. **Contraintes DuploJS comme information de typage** (`DNumber.Int`, `NotZero`…). Elles pourraient permettre des types Go plus rapides (`int64` au lieu de `float64`), à cadrer à cause des différences de débordement.
5. **Variables locales inutilisées.** Go les refuse, TS les accepte.
6. **Imports des dépendances partagées.** Ils sont concaténés sans dédoublonnage dans `shard_dependencies.go`. Deux dépendances qui importent `fmt` donneraient un import en double.
