# Projet 03 : conception

## Le problème

`projects/03` pose une question (voir son `README.md`) : **composer des transformations dans un pipe**. `result` passe par `DCommon.pipe`, puis par `DEither.whenIsRight` configuré avec `DArray.coalescing`. Chaque étape reçoit le résultat de la précédente.

```ts
const newResult = DCommon.pipe(
	result,
	DEither.whenIsRight(          // forme curryfiée : renvoie une fonction
		DArray.coalescing,
	),
);
```

Différence avec 02 : `whenIsRight` reçoit **un seul** argument et renvoie une **fonction** qui attend l'entrée. C'était la limite `un-support-whenIsRight-curried` de 02.

## Ce que sait le checker

Une sonde sur 03 montre que TS a déjà tout instancié :

```
pipe(…)                    : Fail | readonly [number]
  paramètre 1 (l'étape)    : (input: Fail | Success<number>) => Fail | readonly [number]
whenIsRight(coalescing)    : (input: Fail | Success<number>) => Fail | readonly [number]
  paramètre 0              : (eitherValue: number) => readonly [number]
```

Le type de la forme curryfiée est donc **connu, concret, sans générique** : il suffit de le lire.

## Résultat

Le Go généré affiche **la même sortie** que le programme TS (identique à 02) :

```
{"@duplojs/lang/kind/@DuplojsLangEither/right":null,…,"@duplojs/lang/kind/@DuplojsLangEither/value":3,…}
[3]
```

`pnpm test` : **22 tests sur 22 au vert** (projets 00 à 03 + fixtures), `tsc` passe, le lint passe (hors `projects/11`, indenté avec des espaces), `go vet` est propre sur 00 à 03.

Go généré pour le `pipe` (noms de types raccourcis) :

```go
Generated_6 := shard_dependencies.CoalescingValue[float64]         // argument de whenIsRight, évalué une fois
Generated_9 := func(Generated_7 Union2[EitherFail, EitherSuccess[float64]]) (Union2[[]float64, EitherFail]) {
	var Generated_8 Union2[[]float64, EitherFail]
	if Generated_7.Tag == 0 {                                       // Fail : inchangé
		Generated_8 = (Union2[…]{Tag: 1, V1: Generated_7.V0})
	} else {                                                        // Success : coalescing(valeur)
		Generated_8 = (Union2[…]{Tag: 0, V0: Generated_6(Generated_7.V1.Value)})
	}
	return Generated_8
}
Sourced_newResult = Generated_9(Sourced_result)                     // le pipe
```

## Les idées utilisées

### 1. Une forme curryfiée devient une closure Go typée par le checker

`whenIsRight(f)` devient une **fonction Go** `func(input In) Out { … }` :
- `In` et `Out` viennent du **type de l'appel** curryfié, déjà instancié par son contexte (ici, le paramètre de `pipe`) : premier call signature, paramètre 0 et type de retour ;
- `f` est transformée et rangée **avant** la closure, puis capturée : elle est évaluée une seule fois, à la création, comme en JS ;
- le corps de la closure est exactement celui de la forme à deux arguments, appliqué au paramètre.

Pourquoi une closure plutôt qu'un cas particulier dans `pipe` : la forme curryfiée est alors une **valeur comme une autre**. Elle marche dans `pipe`, dans une variable, passée à `DArray.map`…

### 2. Un seul cœur pour les deux formes de `whenIsRight`

`applyWhenIsRight` reçoit une entrée et une fonction **déjà transformées**, et produit la chaîne `if Tag == i` (idée 4 de 02). Les deux formes ne font que préparer ses paramètres :

| Forme | Entrée | Types |
|---|---|---|
| `whenIsRight(input, f)` | l'expression `input` | type de `input`, type de l'appel |
| `whenIsRight(f)` | le paramètre de la closure | paramètre et retour du type de l'appel |

Dans les deux cas, le type renvoyé par `f` vient de la **signature résolue** de l'appel.

### 3. `pipe(x, s1, s2)` → `s2(s1(x))`

- **Ordre d'évaluation JS respecté** : tous les arguments (l'entrée, puis chaque étape) sont transformés et rangés dans une variable (`bindOnce`, sauf un simple identifiant) **avant** le premier appel. C'est l'ordre de JS : `pipe` reçoit des valeurs déjà calculées ;
- puis les appels sont **imbriqués** : Go évalue l'appel intérieur avant l'appel extérieur, pas besoin de variable intermédiaire ;
- entre deux étapes, la valeur est **convertie** (`convertToType`) vers le type du paramètre de l'étape suivante, lu dans la signature résolue de `pipe` (paramètre `i` → son call signature → paramètre 0). Le plus souvent, les deux types sont identiques et rien n'est ajouté.

Une étape peut être n'importe quelle fonction : référence (`double`), fonction générique instanciée (`DArray.coalescing`, `DEither.success`), forme curryfiée (`whenIsRight(f)`).

### 4. Signature instanciée d'une référence : une fonction partagée

`getInstantiatedSignature` (sortie de `coalescing` vers `shared/instantiatedSignature.ts`) répond à « quelle instance de cette fonction générique est utilisée ici ? » :
- appelée (`f(x)`) : la signature résolue de l'appel ;
- passée en valeur (`pipe(x, f)`) : le premier call signature du **type contextuel**.

Elle sert maintenant aussi à `DEither.success` : il peut être passé comme étape (`pipe(2, double, DEither.success)` → `shard_dependencies.EitherSuccessOf[float64]`). C'est ce dont 11 aura besoin (`pipe(…, DString.length, DEither.success)`).

## Ce qui a été modifié (fichiers existants)

| Fichier | Avant | Après |
|---|---|---|
| `src/transpiler/transformers/duplojs/either/whenIsRight.ts` | forme à deux arguments seulement | cœur `applyWhenIsRight` + forme curryfiée (closure) ; types Go regroupés (`getGoTypes`, `getFunctionReturnType`) |
| `src/transpiler/transformers/duplojs/either/success/index.ts` | référence acceptée seulement comme fonction appelée | aussi passée en valeur, via `getInstantiatedSignature` |
| `src/transpiler/transformers/duplojs/array/coalescing/index.ts` | `getInstantiatedSignature` locale | utilise la version partagée |
| `src/transpiler/transformers/duplojs/common/index.ts` | `print` | + `pipe` |
| `src/transpiler/transformers/shared/index.ts` | `call` | + `instantiatedSignature` |
| `package.json` | `build:00` à `build:02` | + `build:03` |

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `src/transpiler/transformers/duplojs/common/pipe/index.ts` | `DCommon.pipe(input, ...steps)` |
| `src/transpiler/transformers/shared/instantiatedSignature.ts` | signature instanciée d'une fonction là où elle est utilisée |

Tests (locaux, `tests/` est ignoré par git) : 03 ajouté à `tests/e2e/projects.test.ts` ; la fixture `union-runtime` a trois `pipe` de plus, comparés à l'exécution avec TS :
- `pipe(failed, whenIsRight(coalescing))` : la branche `Fail` à travers la closure ;
- `pipe(2, double, double)` : deux étapes ;
- `pipe(2, double, DEither.success, whenIsRight(coalescing))` : `success` en valeur, et `whenIsRight` sur une variante seule (closure à une branche).

## Ce qui a été supprimé

| Élément | Raison |
|---|---|
| erreur `un-support-whenIsRight-curried` | la forme curryfiée est prise en charge |
| erreur `un-support-success-without-call` | `success` peut être passé en valeur |
| `getInstantiatedSignature` dans `coalescing` | déplacée dans `shared/` |

## Limites connues

| Erreur | Cas |
|---|---|
| (erreur Go, pas du transpiler) | `pipe(x, DCommon.print)` : une étape générique **sans** instanciation est rangée par `:=`, que Go refuse. Piste : ne pas ranger les références simples (`pkg.F`), comme pour les appels (idée 7 de 01) |
| `un-support-pipe-as-value` | `pipe` passé lui-même comme valeur |
| `un-support-pipe-arguments` | `pipe(x)` sans étape |
| `un-support-whenIsRight-as-value` | `whenIsRight` passé lui-même comme valeur |
| `un-support-type-conversion` | toujours : union vers union plus large |

## Questions ouvertes

1. **Coût de la closure.** Une closure créée puis appelée une fois : Go peut l'inliner si elle est petite, mais la chaîne de `if` ne l'est pas toujours. Optimisation possible : quand une étape de `pipe` est une forme curryfiée connue, appliquer directement le cœur (`applyWhenIsRight`) à la valeur, sans closure. À mesurer avant.
2. **Méthodes génériques (Go 1.27).** `func (u Union2[T0, T1]) WhenV1[R any](f func(T1) R) Union2[T0, R]` écrirait `whenIsRight` une fois dans `shard_dependencies`. Non retenu : la méthode ne sait pas, sur son type seul, quelle variante est un Right, et le type de sortie TS (union triée, dédoublonnée) ne correspond pas toujours à `Union2[T0, R]`.
3. **Rétrécissement (narrowing).** Toujours ouvert, nécessaire pour 11 : `getTypeAtLocation` sur l'entrée d'un `pipe` donne le type rétréci, alors que la variable Go garde son type déclaré.
