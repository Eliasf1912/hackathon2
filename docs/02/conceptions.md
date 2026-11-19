# Projet 02 : conception

## Le problème

`projects/02` pose une question (voir son `README.md`) : **transmettre une fonction pour transformer un résultat sous condition**. `DEither.whenIsRight` reçoit le résultat de `add` et la fonction `DArray.coalescing`. Si le résultat est un `Right`, la fonction est appliquée à sa valeur ; sinon, il est renvoyé tel quel.

```ts
const result = add(1, 2);              // Success<number> | Fail

if (DEither.isRight(result)) {
	DCommon.print(result);
}

const newResult = DEither.whenIsRight(
	result,
	DArray.coalescing,                 // fonction générique passée comme valeur
);

DCommon.print(newResult);              // Fail | readonly [number]
```

Trois difficultés :
1. le type du résultat, `Fail | readonly [number]`, n'est plus une union d'Either seulement. L'interface `Either` de 01 ne suffit plus ;
2. `DArray.coalescing` est une fonction **générique** passée **comme valeur**. Go refuse de manipuler une fonction générique sans l'instancier ;
3. il faut traduire `DEither.fail()`, `readonly`, les tuples et `-x` (ce dernier pour la fixture qui teste la branche `Fail`).

## Résultat

Le Go généré affiche **la même sortie** que le programme TS :

```
{"@duplojs/lang/kind/@DuplojsLangEither/right":null,"@duplojs/lang/kind/@DuplojsLangEither/information":"success","@duplojs/lang/kind/@DuplojsLangEither/value":3,"@duplojs/lang/kind/@DuplojsLangEither/success":null}
[3]
```

`pnpm test` : **21 tests sur 21 au vert** (projets 00, 01 et 02 + fixtures), `tsc` et le lint passent, `go vet` est propre sur 00, 01 et 02.

Go généré pour `index.ts` (noms de paquets raccourcis) :

```go
var Sourced_result shard_dependencies.Union2[shard_dependencies.EitherFail, shard_dependencies.EitherSuccess[float64]]

var Sourced_newResult shard_dependencies.Union2[[]float64, shard_dependencies.EitherFail]

func init() {
	Generated_2 := (float64)(1)
	Generated_3 := (float64)(2)
	Sourced_result = add.Sourced_add(Generated_2, Generated_3)
	if Sourced_result.Tag == 1 {
		Generated_5 := Sourced_result
		shard_dependencies.Print(Generated_5)
	}
	Generated_6 := shard_dependencies.CoalescingValue[float64]
	var Generated_7 shard_dependencies.Union2[[]float64, shard_dependencies.EitherFail]
	if Sourced_result.Tag == 0 {          // Fail : renvoyé tel quel
		Generated_7 = (shard_dependencies.Union2[…]{
			Tag: 1,
			V1: Sourced_result.V0,
		})
	} else {                               // Success : coalescing(valeur)
		Generated_7 = (shard_dependencies.Union2[…]{
			Tag: 0,
			V0: Generated_6(Sourced_result.V1.Value),
		})
	}
	Sourced_newResult = Generated_7
	Generated_9 := Sourced_newResult
	shard_dependencies.Print(Generated_9)
}
```

Et pour `add.ts` : la valeur `Success` est **emballée** dans sa variante au moment du `return`.

```go
func Sourced_add(Sourced_one float64, Sourced_two float64) (shard_dependencies.Union2[shard_dependencies.EitherFail, shard_dependencies.EitherSuccess[float64]]) {
	…
	return (shard_dependencies.Union2[…]{
		Tag: 1,
		V1: Generated_10(Generated_13),
	})
}
```

Tous les types sont concrets : pas d'`any`, pas d'interface, pas d'allocation pour l'union. `Sourced_result.V1.Value` est un vrai `float64`.

## Les idées utilisées

### 1. Une union TS devient une union taguée générale `UnionN`

La « question ouverte n°1 » de 01 est tranchée : l'interface `Either` (environ ×13 et une allocation par appel) est remplacée par une **struct étiquetée**, générique, une par **nombre** de variantes :

```go
type Union2[T0 any, T1 any] struct {
	Tag uint8   // quelle variante est active
	V0  T0
	V1  T1
}

func (union Union2[T0, T1]) MarshalJSON() ([]byte, error) {
	if union.Tag == 0 {
		return json.Marshal(union.V0)
	}
	return json.Marshal(union.V1)
}
```

- elle s'applique à **toute** union TS, pas seulement aux Either : `Fail | readonly [number]` devient `Union2[[]float64, EitherFail]` ;
- un seul type Go par arité (`Union2`, `Union3`…), déclaré une fois dans `shard_dependencies`. Pas de nom à inventer par union ;
- les membres sont **dédoublonnés** par leur écriture Go : `"a" | "b"` donne deux fois `string`, donc `string` tout court, sans union ;
- les membres sont **triés** par leur écriture Go : `A | B` et `B | A` donnent exactement le même type Go, donc des valeurs compatibles ;
- `MarshalJSON` n'affiche que la variante active : le JSON reste identique à celui de TS.

Prix : une struct qui contient **toutes** les variantes (sa taille est la somme des tailles). Ce coût n'a pas encore été mesuré.

### 2. Emballer une valeur dans l'union là où le type cible est connu

Une valeur `Success<number>` n'est pas une `Union2[…]`. TS l'accepte silencieusement ; Go non. Le transpiler convertit donc la valeur **aux endroits où il connaît le type attendu** (`convertToType`) :
- `return` : vers le type de retour de la fonction englobante ;
- variable de module, ou variable locale **annotée** : vers le type de la variable.

Règles de `convertToType` :
- même type Go → inchangé ;
- type membre de l'union cible → `UnionN{Tag: i, Vi: valeur}` ;
- sinon → erreur `un-support-type-conversion` (jamais un résultat faux).

Une variable locale **sans** annotation garde le type de sa valeur (`x := valeur`) : il n'y a rien à convertir.

### 3. `isRight` sur une union devient un test d'étiquette

`DEither.isRight(result)` devient `result.Tag == 1`. Le transpiler sait sur le **type Go seul** quels membres sont des Right : chaque variante Right se déclare dans un registre (`declareRightVariantType`). Il le faut, parce que DuploJS marque ses variantes par des **clés symboles**, que le checker n'expose pas sous un nom lisible.

- plusieurs variantes Right : `x.Tag == 1 || x.Tag == 3` ;
- aucune : `false` (l'expression reste évaluée, comme en JS) ;
- une variante seule, hors union : `x.IsRight()`, la méthode existe toujours sur chaque variante.

L'exercice 01 en profite : son Go utilise maintenant la même union.

### 4. `whenIsRight` : une branche par variante de l'entrée

Pour chaque variante de l'entrée :
- variante Right : `f(entrée.Vi.Value)` ;
- autre variante : la valeur telle quelle ;

puis chaque branche est **convertie** (idée 2) vers le type de sortie que donne le checker. Le résultat est une chaîne `if Tag == 0 {…} else if … else {…}` qui remplit une variable de sortie.

Les types viennent du checker :
- type de l'entrée : le type à l'endroit de l'argument ;
- type de sortie : le type de l'appel lui-même ;
- type renvoyé par `f` : la signature **résolue** de l'appel (donc instanciée), paramètre 1.

L'entrée et la fonction ne sont évaluées qu'une fois (`bindOnce` : un identifiant est relu tel quel, sinon il passe par une variable temporaire). Sans variante Right, `f` est évaluée mais jamais appelée, comme en JS.

### 5. Une fonction générique passée en valeur : le checker choisit l'instance

`DArray.coalescing` a deux surcharges : valeur seule → `[valeur]`, tableau → inchangé. En TS, le choix se fait à l'exécution. En Go, une fonction générique doit être **instanciée** avant d'être rangée dans une variable.

Le checker connaît déjà l'instance utilisée à cet endroit : via le **type contextuel** (ici, le paramètre de `whenIsRight`), `coalescing` est vu comme `(value: number) => readonly [number]`. Le transpiler :
- regarde si le paramètre est un tableau ou un tuple (`isArrayType` / `isTupleType`) ;
- choisit `CoalescingArray[T]` ou `CoalescingValue[T]` **à la compilation** ;
- produit l'instanciation : `shard_dependencies.CoalescingValue[float64]`.

Aucun test de type à l'exécution. La même méthode servira pour toute fonction générique passée en valeur. Appelé directement (`DArray.coalescing(x)`), il passe par la traduction d'appel habituelle.

### 6. Petits ajouts généraux

- **types** : `T[]` → `[]T` ; `readonly T` → `T` (l'immutabilité est déjà vérifiée par TS) ; tuple homogène `[number, number]` → `[]float64` ;
- **`DEither.fail()`** → `shard_dependencies.EitherFailOf()` ;
- **opérateurs unaires** `-x` et `!x` ;
- **imports partagés dédoublonnés** : la « question ouverte n°6 » de 01 est réglée (`encoding/json` était importé deux fois) ;
- **`transformFunctionReturnType`** extrait de `declaration/function.ts`, pour que `return` connaisse le type de retour (annotation, sinon le checker).

## Ce qui a été modifié (fichiers existants)

| Fichier | Avant | Après |
|---|---|---|
| `src/transpiler/transformers/duplojs/either/sharedDependency.ts` | interface Go `Either` + méthodes `IsRight()` / `EitherInformation()` | identifiants partagés, registre des variantes Right, fabrique de la méthode `IsRight()` |
| `src/transpiler/transformers/duplojs/either/success/sharedDependency.ts` | méthodes `IsRight()` / `EitherInformation()` | `IsRight()` seule + déclaration comme variante Right |
| `src/transpiler/transformers/duplojs/either/fail/sharedDependency.ts` | struct `EitherFail` + méthodes | + constructeur `EitherFailOf()`, `EitherInformation()` retiré |
| `src/transpiler/transformers/duplojs/either/fail/index.ts` | type `DEither.Fail` seulement | + appel `DEither.fail()` |
| `src/transpiler/transformers/duplojs/either/isRight.ts` | `x.IsRight()` | union → test du `Tag` ; variante seule → `x.IsRight()` ; + `bindOnce` |
| `src/transpiler/transformers/duplojs/either/index.ts` | `success`, `isRight`, unions d'Either | + `fail`, + `whenIsRight` ; unions retirées (traitées par `type/union`) |
| `src/transpiler/transformers/duplojs/index.ts` | domaines `either`, `common` | + domaine `array` |
| `src/transpiler/transformers/expression/index.ts` | identifiant, littéraux, binaire, appel | + unaire |
| `src/transpiler/transformers/type/index.ts` | `number`, `boolean`, littéraux, parenthèses, `Success` / `Fail` | + unions, + `readonly`, + tableaux / tuples |
| `src/transpiler/transformers/declaration/function.ts` | type de retour calculé sur place | `transformFunctionReturnType` partagé |
| `src/transpiler/transformers/statement/return.ts` | valeur renvoyée telle quelle | convertie vers le type de retour de la fonction englobante |
| `src/transpiler/transformers/statement/variable.ts` | valeur affectée telle quelle | convertie vers le type de la variable (module ou locale annotée) |
| `src/transpiler/build.ts` | imports des dépendances partagées concaténés | dédoublonnés par chemin |
| `package.json` | `build:00`, `build:01` | + `build:02` |

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `src/transpiler/transformers/type/union/index.ts` | union TS → `UnionN` ; `convertToType` ; accès aux variantes et test du `Tag` ; type checker → type Go |
| `src/transpiler/transformers/type/union/sharedDependency.ts` | déclaration de `UnionN[T0…]` + `MarshalJSON`, une par arité |
| `src/transpiler/transformers/type/array.ts` | `readonly T`, `T[]`, tuples homogènes |
| `src/transpiler/transformers/duplojs/either/whenIsRight.ts` | `DEither.whenIsRight(entrée, f)` |
| `src/transpiler/transformers/duplojs/array/index.ts` | domaine `DArray` |
| `src/transpiler/transformers/duplojs/array/coalescing/` | `coalescing` appelé ou passé en valeur ; `CoalescingValue[T]` / `CoalescingArray[T]` |
| `src/transpiler/transformers/expression/unary.ts` | `-x`, `!x` |
| `tests/fixtures/union-runtime/` + `tests/transpiler/unionRuntime.test.ts` | exécute **les deux branches** (`check(-1)` → `Fail`, `check(2)` → `Success`) et compare la sortie TS et Go |

`tests/e2e/projects.test.ts` couvre maintenant 02, et `tests/transpiler/eitherUnion.test.ts` a été réécrit pour l'union taguée. `tests/` reste ignoré par git.

## Ce qui a été supprimé

| Élément | Raison |
|---|---|
| `src/transpiler/transformers/duplojs/either/union.ts` | les unions d'Either sont des unions comme les autres (`type/union`) |
| interface Go `Either` | remplacée par `UnionN` (valeur, sans allocation) |
| méthode `EitherInformation()` | n'existait que pour l'interface |

## Limites connues (erreurs explicites)

| Erreur | Cas |
|---|---|
| `un-support-type-conversion` | une union vers une union **plus large** (`A \| B` → `A \| B \| C`), ou tout autre couple de types non prévu |
| `un-support-whenIsRight-curried` | `DEither.whenIsRight(f)` en forme curryfiée, pour `pipe` (**nécessaire à 03**) |
| `un-support-whenIsRight-as-value` | `whenIsRight` passé lui-même comme valeur |
| `un-support-heterogeneous-or-empty-tuple` | `[number, string]`, `[]` (à traduire en struct quand un exercice en aura besoin) |
| `un-support-isRight-as-value` | toujours : `DArray.filter(list, DEither.isRight)` |
| (aucune conversion) | les **arguments d'appel** ne sont pas encore convertis vers le type du paramètre |

## Questions ouvertes

1. **Rétrécissement (narrowing).** Dans `if (isRight(result))`, `result` reste une `Union2` en Go. Ça suffit pour `print`, mais lire `result.value` dans la branche demandera d'accéder à `result.V1` selon le type que le checker donne **à cet endroit**.
2. **Coût de `UnionN`.** Pas d'allocation, mais la struct contient toutes les variantes. À mesurer à 2, 3 et 5 variantes, comme prévu dans 01.
3. **Tuple traduit en slice.** La longueur fixe est perdue en Go (TS la vérifie déjà). Un tableau Go `[N]T` serait plus rapide, mais n'a pas le même type que `[]T`.
4. **`CoalescingArray` non testé.** Les littéraux de tableau (`[4, 5]`) ne sont pas encore traduits, donc aucune fixture ne passe par cette branche.
5. **Noms de types Go longs.** `Union2[[]float64, shard_dependencies.EitherFail]` est répété à chaque emballage. Un alias de type par union rendrait le Go plus lisible, sans coût à l'exécution.
6. **Registre des variantes Right.** C'est un état global du transpiler, rempli au chargement du module de chaque variante (`success/sharedDependency.ts`). Il marche tant que chaque variante Right se déclare elle-même ; une variante oubliée serait traitée comme un Left.

## Apports de la spécification Go

Relecture de la spécification (go1.27, 26 mai 2026) ; le Go généré est compilé avec Go 1.27.4 (`go.mod`, téléchargé automatiquement). Les points 1 à 3 ont été vérifiés sur un petit programme.

### Ce qui peut nous aider

1. **Inférence des fonctions génériques passées en valeur** (Go 1.27) : *« type argument lists may be omitted entirely if the function is … assigned to a variable with a known type, passed as an argument to another function, or returned as a result »*.
   ```go
   var f func(float64) []float64 = CoalescingValue   // sans [float64]
   apply(2.0, CoalescingValue)
   ```
   Simplification possible pour `coalescing` passé en valeur (le choix Value / Array reste à faire par le transpiler).
2. **Méthodes génériques** (Go 1.27) : une méthode peut déclarer ses propres paramètres de type.
   ```go
   func (u Union2[T0, T1]) WhenV1[R any](f func(T1) R) Union2[T0, R] { … }
   ```
   Piste pour `whenIsRight` curryfié et `pipe` (exercice 03) : une méthode écrite une fois dans `shard_dependencies` au lieu d'une chaîne de `if` à chaque appel. Limite : la méthode ne sait pas, sur son type seul, quelle variante est un Right (c'est le transpiler qui le sait). Coût non mesuré.
3. **Alias génériques** (Go 1.24) : `type Result = Union2[[]float64, EitherFail]`, sans coût à l'exécution. Répond à la question ouverte n°5.
4. **Clés de champs promus dans les struct littérales** (Go 1.27) : piste pour que `EitherSuccess` et `EitherFail` partagent leurs champs communs par embarquement.

### Ce qui confirme nos choix

- **Ordre d'évaluation** : seuls les appels, les réceptions et `&&` / `||` sont ordonnés ; dans `x := []int{a, f()}`, *« evaluation order between a and f() is not specified »*. Les calculs préalables (`before`) restent nécessaires.
- **Interfaces à union** (`~int | float64`) : utilisables seulement comme contraintes, jamais comme type de valeur. `UnionN` reste la bonne voie.
- **Initialisation des paquets** : *« sorted by import path … for which all imported packages are already initialized »*, comme noté dans 01.

### Pièges pour la suite

| Règle Go | Conséquence |
|---|---|
| un paquet ne peut pas s'importer lui-même, même indirectement | **les imports circulaires TS ne compilent pas en Go** (un fichier TS = un paquet Go) : plus gros risque pour un projet complet |
| `%` réservé aux entiers | `a % b` sur des `number` → `math.Mod` |
| conversion float → entier hors limites : résultat dépendant de l'implémentation | à vérifier si `DNumber.Int` devient `int64` |
| une chaîne est une suite d'octets, `len` compte les octets | `.length` JS compte des unités UTF-16 (`"é"` : 1 en JS, 2 en Go) |
| slices non comparables ; struct comparable seulement si tous ses champs le sont | `===` sur une `Union2[[]float64, …]` ne compile pas |
| variables locales inutilisées refusées | déjà noté dans 01 |
| pas de passage implicite au `case` suivant (`fallthrough` explicite) | un `case` JS sans `break` → `fallthrough` |
| range sur fonction-itérateur (1.23), variable par itération (1.22), `min` / `max` / `clear` | correspondances pour `for…of`, `let` en boucle |

Les lignes `switch`, `range` sur chaîne et itérateurs n'ont été relues qu'en résumé.
