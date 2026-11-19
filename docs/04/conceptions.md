# Projet 04 : conception

## Le problème

`projects/04` pose une question (voir son `README.md`) : **représenter plusieurs chemins de retour**. `add` renvoie un échec quand `one` vaut `-1`, sinon un succès. La fonction n'a **pas d'annotation de type de retour** : c'est TS qui en déduit l'union.

```ts
export function add(one: number, two: number) {
	if (one === -1) {
		return DEither.fail();
	}
	return DEither.success(one + two);
}
```

`index.ts` est celui de 03, avec `add(-1, 2)` : c'est la branche `Fail` qui s'exécute.

## Résultat

**Aucune modification du transpiler n'a été nécessaire.** Les règles de 01 à 03 suffisent. Le Go généré affiche la même sortie que TS :

```
{"@duplojs/lang/kind/@DuplojsLangEither/left":null,"@duplojs/lang/kind/@DuplojsLangEither/information":"fail","@duplojs/lang/kind/@DuplojsLangEither/fail":null}
```

(`isRight` est faux, donc rien n'est affiché dans le `if` ; `whenIsRight` renvoie le `Fail` tel quel.)

```go
func Sourced_add(Sourced_one float64, Sourced_two float64) (shard_dependencies.Union2[shard_dependencies.EitherFail, shard_dependencies.EitherSuccess[float64]]) {
	Generated_12 := Sourced_one
	Generated_13 := -((float64)(1))
	if Generated_12 == Generated_13 {
		return (shard_dependencies.Union2[…]{
			Tag: 0,
			V0: shard_dependencies.EitherFailOf(),
		})
	}
	…
	return (shard_dependencies.Union2[…]{
		Tag: 1,
		V1: Generated_14(Generated_17),
	})
}
```

## Les règles qui s'appliquent

| Besoin de 04 | Règle existante |
|---|---|
| type de retour sans annotation | `transformFunctionReturnType` (02) : le type que donne le checker, `Fail \| Success<number>`, devient `Union2[EitherFail, EitherSuccess[float64]]` |
| deux `return` de variantes différentes | conversion au `return` (02) : chaque valeur est emballée dans sa variante (`Tag: 0` / `Tag: 1`) |
| `if` qui se termine par `return` | `if` de 01 ; Go accepte un `return` dans un `if` suivi d'un autre `return` |
| `-1` | opérateur unaire de 02 |
| `===` | opérateur binaire existant → `==` (même sens pour des nombres) |
| `DEither.fail()` | 02 |
| la branche `Fail` dans `pipe` / `whenIsRight` | closure de 03 |

## Ce qui a été modifié

| Fichier | Changement |
|---|---|
| `package.json` | scripts `build:04` à `build:10` |

Tests (locaux) : 04 ajouté à `tests/e2e/projects.test.ts`.

## Remarque

`===` sur des nombres devient `==`. C'est exact pour `float64` (même comparaison IEEE, `NaN !== NaN` des deux côtés). Ce ne sera plus vrai pour des valeurs non comparables en Go (slices, unions contenant une slice : voir « Apports de la spécification Go » dans `docs/02`).
