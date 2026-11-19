# Projet 07 : conception

## Le problème

`projects/07` pose une question (voir son `README.md`) : **enchaîner des opérations dépendantes**. `DEither.rightPipe` passe le résultat de `add` à `divide`, qui peut aussi échouer. La suite doit s'arrêter dès qu'une étape produit un échec, et cet échec doit devenir le résultat final.

```ts
const result = DEither.rightPipe(
	add(1, 2),                       // Success<3>
	(value) => divide(value, 0),     // Left<"division-by-zero", 0>
);

const message = DEither.matchInformation(result, {
	"negative-operand": () => "un opérande est négatif",
	"division-by-zero": () => "division par zéro impossible",
	success: DString.to,             // fonction générique passée en gestionnaire
});
```

## Ce que sait le checker

```
rightPipe(…)               : Left<"division-by-zero", 0> | Left<"negative-operand", number> | Success<number>
  paramètre 1              : RightPipeFunction<…> = (value: number) => Left<"division-by-zero", 0> | Success<number>
DString.to (dans le matcher) : type propre générique ; type contextuel (value: number) => string & Number
```

Les deux `Left` ont une valeur `number` (le littéral `0` est élargi) : en Go, ils forment **une seule** variante `EitherLeft[float64]` (dédoublonnage de 02), distinguée à l'exécution par son `Information`.

## Ce que fait DuploJS à l'exécution

Lu dans `dist/either/right/pipe.mjs` :

```js
if (isLeft(input)) return input;
let acc = isRight(input) ? valueKind.getValue(input) : input;
for (const pipe of pipes) {
	acc = pipe(isRight(acc) ? valueKind.getValue(acc) : acc);
	if (isLeft(acc)) return acc;
}
return isRight(acc) ? acc : success(acc);
```

## Résultat

Le Go généré affiche **la même sortie** que TS :

```
["-12"]
"division par zéro impossible"
```

`pnpm test` : **28 tests sur 28 au vert**, `tsc` et le lint passent, `go vet` propre sur 00 à 07.

```go
Generated_8 := func(Sourced_value float64) (Union2[EitherLeft[float64], EitherSuccess[float64]]) {
	…
	return divide.Sourced_divide(Generated_6, Generated_7)
}
Sourced_result = func() (Union2[EitherLeft[float64], EitherSuccess[float64]]) {
	var Generated_9 float64
	if Generated_4.Tag == 0 {
		return (Union2[…]{Tag: 0, V0: Generated_4.V0})   // Left en entrée : arrêt
	} else {
		Generated_9 = Generated_4.V1.Value               // Success : sa valeur
	}
	Generated_10 := Generated_8(Generated_9)
	if Generated_10.Tag == 0 {
		return (Union2[…]{Tag: 0, V0: Generated_10.V0})  // Left : arrêt
	} else {
		return (Union2[…]{Tag: 1, V1: Generated_10.V1})  // Right : résultat
	}
}()
```

## Les idées utilisées

### 1. `rightPipe` : une fonction appelée sur place, avec des `return` anticipés

L'arrêt au premier `Left` est un **retour anticipé**. Une fonction Go appelée immédiatement (`func() Out { … }()`) l'exprime directement, avec un code **linéaire** en nombre d'étapes (pas d'imbrication par variante).

Pour chaque étape, une branche par variante de la valeur courante :
- `Left` → `return` (converti vers le type de sortie) ;
- Right → sa valeur va dans l'argument de l'étape suivante (`argument = x.Vi.Value`) ;
- autre valeur → passe telle quelle.

En fin de chaîne : un Right est renvoyé tel quel, une autre valeur devient `EitherSuccessOf[T](valeur)`.

Les types viennent du checker : paramètre et retour de chaque étape lus dans la signature résolue, type de sortie lu sur l'appel. Tous les arguments (entrée, fonctions) sont évalués une fois, avant, dans l'ordre JS.

### 2. Les outils de répartition par variante sont partagés

`either/dispatch.ts` regroupe ce que `matchInformation` et `rightPipe` utilisent :
- `getVariants` : membres d'une union (accès `x.Vi`, test `x.Tag == i`), ou la valeur seule ;
- `chainBranches` : `if … else if … else` dont la dernière branche est le `else` ;
- `flattenChain` : le `if`, ou les instructions de l'unique branche.

### 3. Fonction générique passée en valeur : la signature du contexte

`success: DString.to` : le type propre de `DString.to` est générique, donc inutilisable pour typer l'appel. `getFunctionValueSignature` (`shared/functionValue.ts`) prend la signature propre d'une fonction, **sauf si elle est générique** ; alors celle que le contexte instancie (`(value: number) => string & Number`).

### 4. `%` sur des nombres → `math.Mod`

Go n'a pas de `%` sur les flottants (spécification Go). `math.Mod(a, b)` garde le signe du dividende, comme JS (`-7 % 2` vaut `-1` dans les deux). L'import `math` est ajouté au fichier, une seule fois.

## Ce qui a été modifié (fichiers existants)

| Fichier | Changement |
|---|---|
| `src/transpiler/transformers/duplojs/either/index.ts` | + `rightPipe` |
| `src/transpiler/transformers/duplojs/either/matchInformation.ts` | utilise `dispatch.ts` et `getFunctionValueSignature` |
| `src/transpiler/transformers/shared/functionValue.ts` | + `getFunctionValueSignature` |
| `src/transpiler/transformers/expression/binary.ts` | `%` → `math.Mod` |

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `src/transpiler/transformers/duplojs/either/rightPipe.ts` | `DEither.rightPipe` |
| `src/transpiler/transformers/duplojs/either/dispatch.ts` | variantes et chaînes de `if` partagées |

Tests (locaux) : 07 dans les e2e ; la fixture `either-variants` couvre `rightPipe` à l'exécution : `Left` en entrée, trois étapes complètes (`8 → 4 → 2 → 20`), arrêt au milieu (`6 → 3`, impair), valeur simple enveloppée en `success`, `Right` non `Success` intermédiaire. Elle utilise aussi `%`.

## Limites connues

| Erreur | Cas |
|---|---|
| `un-support-rightPipe-as-value` | `rightPipe` passé lui-même en valeur |
| (`go vet`) | une étape qui suit une entrée toujours `Left` serait du code inatteignable |

## Questions ouvertes

1. **Coût de la fonction appelée sur place.** Elle n'échappe pas (pas d'allocation), et Go peut l'inliner si elle est petite. À mesurer sur une longue chaîne.
2. **`whenIsRight`, `matchInformation` et `rightPipe` partagent maintenant `dispatch.ts`, sauf `applyWhen`** (écrit avant) : à aligner si on y retouche.
