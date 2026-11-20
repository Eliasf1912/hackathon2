# Projet 10 : conception

## Le problème

`projects/10` pose deux questions (voir son `README.md`) :

1. **Composer des résultats asynchrones** : `DEither.rightAsyncPipe` enchaîne les étapes d'un calcul, `DEither.asyncGroup` regroupe plusieurs calculs, `DCommon.asyncPipe` compose le traitement final ;
2. **Représenter l'asynchronisme TS en Go** : `async`, `Promise` et `await` n'existent pas en Go. Comment traduire ce flux sans modifier l'ordre des opérations ni le moment où les résultats deviennent disponibles ?

```ts
async function calculate(one: number, two: number, divisor: number) {
	return DEither.rightAsyncPipe(
		add(one, two),
		(value) => divide(value, divisor),
		(value) => DEither.success(value * 2),
	);
}

const calculations = DEither.asyncGroup([
	() => calculate(1, 2, 1),
	() => calculate(4, 5, 3),
	() => calculate(2, 3, 0),
]);

const completedCalculations = DCommon.asyncPipe(calculations, DEither.whenIsRightOtherwise(…));

DCommon.print(await completedCalculations);
```

## Décision : modèle synchrone bloquant

Trois modèles ont été proposés :

| Modèle | Pour | Contre |
|---|---|---|
| **synchrone bloquant** (retenu) | le plus rapide, déterministe ; même résultat que JS quand aucun effet visible ne s'intercale entre la création d'une promesse et son `await` | l'ordre des microtâches JS n'est pas reproduit (voir « Limite ») |
| boucle d'événements émulée | fidèle dans tous les cas | beaucoup de code, une allocation par promesse, appels indirects |
| goroutines + channels | vrai parallélisme | ordre des effets non déterministe, alors que JS est mono-thread |

Traduction :
- `Promise<T>` → `T` ;
- `async function f(): Promise<T>` → `func f() T` (rien de plus : le type de retour perd sa promesse) ;
- `await x` → `x`.

## Ce que fait DuploJS à l'exécution

Lu dans `dist/` :
- `rightAsyncPipe` : comme `rightPipe` (07), avec un `await` sur l'entrée et sur chaque étape ;
- `asyncGroup` : comme `group` (09), **séquentiel** : chaque getter est appelé puis attendu, et le premier `Left` arrête le parcours, sans appeler les getters suivants ;
- `asyncPipe` : comme `pipe` (03), avec un `await` sur chaque étape.

Tout est séquentiel : dans le modèle synchrone, ce sont exactement `rightPipe`, `group` et `pipe`. Aucune nouvelle logique n'a été écrite pour eux.

## Résultat

Le Go généré affiche **la même sortie** que TS (le troisième calcul divise par zéro) :

```
["transaction annulée"]
```

`pnpm test` : **32 tests sur 32 au vert**, `tsc` et le lint passent, `go vet` propre sur 00 à 10.

```go
func Sourced_calculate(Sourced_one float64, Sourced_two float64, Sourced_divisor float64) (Union2[EitherLeft[float64], EitherSuccess[float64]]) {
	…                                               // rightAsyncPipe = rightPipe (07)
}

Sourced_calculations = func() (Union2[EitherLeft[float64], EitherSuccess[[3]float64]]) {
	var values [3]float64                           // tuple de 3 getters → [3]float64 (08)
	for index, element := range getters {           // getters : [3]func() Union2[…]
		item := element()                           // getter appelé dans la boucle
		if item.Tag == 0 {
			return (Union2[…]{Tag: 0, V0: item.V0}) // Left : arrêt, getters suivants non appelés
		} else {
			values[index] = item.V1.Value
		}
	}
	return (Union2[…]{Tag: 1, V1: EitherSuccessOf[[3]float64](values)})
}()
```

## Les idées utilisées

### 1. `Promise<T>` → `T`, `await x` → `x`

Une fonction `async` s'exécute jusqu'au bout avant de rendre la main : sa valeur est disponible dès que l'appel se termine. Les types fonction suivent : `() => Promise<X>` → `func() X`.

### 2. Les fonctions asynchrones de DuploJS sont leurs équivalents synchrones

`rightAsyncPipe` → `rightPipe`, `asyncGroup` → `group`, `asyncPipe` → `pipe`. Leurs types instanciés viennent du checker, la promesse y disparaît d'elle-même.

### 3. `group` appelle les getters

Ajout général, utile aussi à `group` (09) : un élément fonction (`() => calcul()`) est appelé **dans la boucle**, donc seulement si les précédents ont réussi, comme DuploJS.

### 4. Types fonction

`(a: A) => R` → `func(_ A) R`. Nécessaire ici pour le tuple de getters (`[3]func() Union2[…]`).

### 5. Deux corrections générales découvertes en route

- **Types tronqués** : pour un type long, le checker écrivait `Left<...>` sans ses arguments. Tous les appels à `typeToTypeNode` passent maintenant `NodeBuilderFlags.NoTruncation`.
- **Message d'erreur sur un nœud synthétisé** : `context.error` appelait `getText()`, qui plante sur un nœud créé par le checker. Il retombe maintenant sur le nom du type de nœud.

## Limite du modèle synchrone (vérifiée)

L'ordre diffère de JS quand un effet visible se place **entre la création d'une promesse et son `await`** :

```ts
async function step(value: number) {
	DCommon.print(value);
	return DEither.success(value);
}

const promise = DEither.asyncGroup([() => step(1), () => step(2)]);
DCommon.print("après");
await promise;
```

JS affiche `après`, `1`, `2` (le corps d'`asyncGroup` ne démarre qu'après un premier `await`, en microtâche). Le modèle synchrone afficherait `1`, `2`, `après`. Dans 10, rien ne s'intercale : la sortie est identique.

## Ce qui a été modifié (fichiers existants)

| Fichier | Changement |
|---|---|
| `src/transpiler/transformers/duplojs/either/index.ts` | + `asyncGroup`, `rightAsyncPipe` |
| `src/transpiler/transformers/duplojs/common/index.ts` | + `asyncPipe` |
| `src/transpiler/transformers/duplojs/either/group.ts` | éléments getters |
| `src/transpiler/transformers/type/index.ts` | + `Promise<T>`, types fonction |
| `src/transpiler/transformers/expression/index.ts` | + `await` |
| `src/transpiler/transformers/type/union/index.ts`, `declaration/function.ts`, `statement/variable.ts`, `duplojs/either/success/index.ts` | `typeToTypeNode` sans troncature |
| `src/transpiler/context/build.ts` | `context.error` sûr sur un nœud synthétisé |

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `src/transpiler/transformers/type/promise.ts` | `Promise<T>` → `T` |
| `src/transpiler/transformers/type/function.ts` | types fonction |
| `src/transpiler/transformers/expression/await.ts` | `await x` → `x` |

Tests (locaux) : 10 dans les e2e ; nouvelle fixture `async-runtime` comparée à TS à l'exécution : fonction `async` avec `await` interne, `rightAsyncPipe` avec une étape `async` et une étape simple, `asyncGroup` en succès et en échec (avec un affichage dans chaque getter : `check 3` n'est jamais appelé après le `Left` sur `-5`, comme en JS), `asyncPipe`.

## Limites connues

| Cas | Effet |
|---|---|
| effet visible entre la création d'une promesse et son `await` | ordre différent de JS (voir ci-dessus) |
| `Promise.all`, `Promise.race`, `.then` | non traduits |
| type nommé `Promise` défini par l'utilisateur | confondu avec la promesse (« shortcut » : reconnue par son nom) |
| types fonction génériques, à paramètre rest ou optionnel | erreur nommée |

## Questions ouvertes

1. **Détecter l'entrelacement** : le transpiler pourrait refuser (erreur nommée) une promesse qui n'est pas attendue immédiatement, et ainsi garantir que le modèle synchrone donne toujours le même ordre que JS.
2. **Vrai parallélisme** : quand l'ordre n'importe pas (calculs purs), des goroutines pourraient accélérer `asyncGroup` ; à réserver à des cas que le transpiler sait prouver sans effet.
