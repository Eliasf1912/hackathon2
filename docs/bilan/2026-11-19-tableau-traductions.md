# Tableau des traductions TypeScript → Go (19/11/2026)

Chaque ligne : ce qu'on écrit en TypeScript, ce que le transpileur écrit en Go, et le fichier qui fait la traduction. Les chemins sont relatifs à `src/transpiler/transformers/`.

⭐ = décision de conception prise avec l'utilisateur. Les fonctions Go communes (`Union2`, `Map`, `Print`…) sont écrites une fois dans le paquet `shard_dependencies` ; le préfixe est omis ci-dessous pour la lecture.

## 1. Types

| TypeScript | Go | Fichier |
|---|---|---|
| `number` | `float64` | `type/float.ts` |
| `string` | `string` | `type/string.ts` |
| `` `${string}@${string}` `` (type gabarit) | `string` | `type/string.ts` |
| `boolean` | `bool` | `type/boolean.ts` |
| `2`, `"saved"`, `true` (type littéral) | `float64`, `string`, `bool` (le type de la valeur) | `type/literal.ts` |
| `null` | `JSNull` | `type/nullish.ts` |
| `undefined` | `JSUndefined` | `type/nullish.ts` |
| `never` | `JSNever` | `type/never.ts` |
| `( T )` | `T` | `type/parenthesized.ts` |
| `T[]`, `readonly T[]` | `[]T` (slice) | `type/array.ts` |
| ⭐ `[number, number, number]` (tuple homogène) | `[3]float64` (tableau de taille fixe) | `type/array.ts` |
| `[number, string]` (tuple hétérogène) | refusé : `un-support-heterogeneous-or-empty-tuple` | `type/array.ts` |
| `readonly T`, `Readonly<T>` | `T` (l'immutabilité est vérifiée par TS) | `type/array.ts`, `type/object.ts` |
| ⭐ `A \| B` (union) | `Union2[A, B]` : struct `{Tag; V0; V1}` | `type/union/index.ts` |
| `"a" \| "b"` | `string` (membres de même type Go fusionnés) | `type/union/index.ts` |
| `A \| B` et `B \| A` | même `Union2` (membres triés ; `undefined` toujours en variante 0) | `type/union/index.ts` |
| `number & DNumber.Positive` (contrainte DuploJS) | `float64` (la contrainte est retirée) | `type/intersection.ts` |
| ⭐ `{ id: string; price: number }` | `struct { Id string "json:\"id\""; Price float64 "json:\"price\"" }` | `type/object.ts` |
| ⭐ `interface Product { … }`, `type Product = { … }` | `type Product = struct { … }` (alias Go) | `type/object.ts`, `type/alias.ts` |
| `{ code?: string }` (champ optionnel) | `Code Union2[JSUndefined, string] "json:\"code,omitzero\""` | `type/object.ts` |
| `Record<string, T>`, `{ [key: string]: T }` | `map[string]T` | `type/object.ts` |
| `type Box<T> = { value: T }` (type générique) | alias générique Go, `T` remplacé à chaque usage | `type/object.ts`, `type/alias.ts` |
| `T` (paramètre de type) | `T` | `type/object.ts` |
| `ReturnType<…>`, `Awaited<…>`, `Parameters<…>`, `InstanceType<…>`, `NonNullable<…>` | le type calculé par le checker TS, puis traduit | `type/object.ts` |
| `type S = "a" \| "b"` (alias qui n'est pas un objet) | déplié : `string` | `type/object.ts` |
| `(a: A, b: B) => R` (type fonction) | `func(_ A, _ B) R` | `type/function.ts` |
| ⭐ `Promise<T>` | `T` (modèle synchrone) | `type/promise.ts` |
| type récursif (`interface Node { children: Node[] }`) | refusé : `un-support-recursive-type` | `type/object.ts` |

## 2. Valeurs et expressions

| TypeScript | Go | Fichier |
|---|---|---|
| `42`, `1.5` | `float64(42)`, `float64(1.5)` | `expression/numericLiteral.ts` |
| `"texte"` | `"texte"` | `expression/literal.ts` |
| `true`, `false` | `true`, `false` | `expression/literal.ts` |
| `null`, `undefined` | `JSNull{}`, `JSUndefined{}` | `expression/nullish.ts` |
| `` `a ${x} b` `` (gabarit) | `"a " + NumberToString(x) + " b"` | `expression/template.ts` |
| `/[0-9]/i` (expression régulière) | `regexp.MustCompile("(?i)[0-9]")`, compilée une fois au démarrage | `expression/regularExpression.ts` |
| `\s`, `.`, `[^]`, `A` dans une regex | leur équivalent RE2 avec le sens JS | `expression/regularExpressionPattern.ts` |
| `x` (variable) | `x`, converti vers le type que TS lui donne à cet endroit (rétrécissement) | `common/identifier.ts` |
| `(x)` | `x` | `expression/parenthesized.ts` |
| `a + b`, `a - b`, `a * b`, `a / b` | même opérateur | `expression/binary.ts` |
| `a % b` | `math.Mod(a, b)` | `expression/binary.ts` |
| `a ** b` | `math.Pow(a, b)` | `expression/binary.ts` |
| `"n=" + count` (chaîne + nombre) | `"n=" + NumberToString(count)` | `expression/binary.ts` |
| `a === b`, `a !== b`, `<`, `<=`, `>`, `>=` | `==`, `!=`, `<`, `<=`, `>`, `>=` | `expression/binary.ts` |
| `x === undefined`, `x !== null` (x peut l'être) | `x.Tag == 0`, `x.Tag != 0` | `expression/binary.ts` |
| `x === undefined` (x ne peut pas l'être) | `false` (constante ; x reste évalué) | `expression/binary.ts` |
| `a && b`, `a \|\| b` | `&&`, `\|\|`, avec le court-circuit JS | `expression/binary.ts` |
| `a & b`, `a << b` (opérateurs sur les bits) | refusé : `un-support-bitwise-operator` | `expression/binary.ts` |
| `-x`, `!x` | `-x`, `!x` | `expression/unary.ts` |
| `cond ? a : b` (ternaire) | `var out T; if cond { out = a } else { out = b }` | `expression/conditional.ts` |
| `a ?? b` | `var out T; if a.Tag == 0 { out = b } else { out = a.V1 }` | `expression/nullishCoalescing.ts` |
| `[1, 2]` (tableau) | `[]float64{1, 2}` | `expression/array.ts` |
| `[1, 2]` (tuple attendu) | `[2]float64{1, 2}` | `expression/array.ts` |
| `[]` | `[]T{}` (le type attendu) | `expression/array.ts` |
| `{ id: "a", price: 2 }` (objet) | `struct{…}{Id: "a", Price: 2}` | `expression/object.ts` |
| `{ ...product, stock: 0 }` (décomposition) | chaque champ recopié, `Stock` remplacé | `expression/object.ts` |
| `{ a, b }` (raccourci) | `{A: a, B: b}` | `expression/object.ts` |
| `{ x: 1 }` attendu comme `Record<string, number>` | `map[string]float64{"x": 1}` | `expression/object.ts` |
| `obj.champ` | `obj.Champ` | `expression/propertyAccess.ts` |
| `request.route` sur une union d'objets | lecture du champ de la variante active (fonction appelée sur place) | `expression/propertyAccess.ts` |
| `tableau.length` | `float64(len(tableau))` | `expression/propertyAccess.ts` |
| `texte.length` | `StringLength(texte)` (unités UTF-16, comme JS) | `expression/propertyAccess.ts` |
| `table[clé]` (`Record`) | `MapGet(table, clé)` → `Union2[JSUndefined, T]` | `expression/elementAccess.ts` |
| `f(a, b)` (appel) | `f(a, b)`, chaque argument converti vers le type du paramètre | `shared/call.ts` |
| `f(a)` avec `f(a, b?: number)` | `f(a, Union2[JSUndefined, float64]{})` (b vaut `undefined`) | `shared/call.ts` |
| `(x) => x * 2` (fonction fléchée) | `func(x float64) float64 { return x * 2 }` | `expression/function.ts` |
| `() => [-12]` passée là où Go attend un paramètre | enveloppée dans une fonction qui ignore l'argument | `shared/functionValue.ts` |
| `([a, b]) => …` (déstructuration de paramètre) | `func(p [2]T) { a := p[0]; b := p[1]; … }` | `expression/function.ts`, `expression/binding.ts` |
| `({ a, b }) => …` | `func(p S) { a := p.A; b := p.B; … }` | `expression/function.ts`, `expression/binding.ts` |
| `f<T>` générique passée en valeur | instanciée avec les types que TS déduit du contexte | `shared/instantiatedSignature.ts` |
| ⭐ `await x` | `x` | `expression/await.ts` |
| `a, b, c` évalués dans l'ordre JS | variables temporaires si nécessaire pour garder l'ordre | `shared/sequence.ts` |

## 3. Instructions et déclarations

| TypeScript | Go | Fichier |
|---|---|---|
| `const x = 1` dans une fonction | `x := float64(1)` | `statement/variable.ts` |
| `const x = …` au niveau du fichier | `var x T` au niveau du paquet, rempli dans `func init()` | `statement/variable.ts` |
| `const { a, b } = obj`, `const [a, b] = t` | `a := obj.A`, `b := obj.B` | `statement/variable.ts` |
| `x = valeur` | `x = valeur` (convertie vers le type déclaré de x) | `statement/assignment.ts` |
| `obj.champ = …`, `x += 1` | refusé (les objets sont des valeurs) | `statement/assignment.ts` |
| `f(x);` (expression seule) | `f(x)` ; une autre valeur : `_ = valeur` | `statement/expression.ts` |
| `if (…) { … } else if … else …` | `if … { … } else if … { … } else { … }` | `statement/if.ts` |
| `for (const x of tableau)` | `for _, x := range tableau` | `statement/forOf.ts` |
| `switch (v) { case "a": …; break; }` | `switch v { case "a": … }` (`break` final retiré) | `statement/switch.ts` |
| `case 1: case 2: …` | `case 1, 2: …` | `statement/switch.ts` |
| cas sans `break` (passe au suivant) | `fallthrough` | `statement/switch.ts` |
| `return x` | `return x` (converti vers le type de retour) | `statement/return.ts` |
| `return;` dans une fonction `void` | `return` | `statement/return.ts` |
| `{ … }` (bloc) | `{ … }` | `statement/block.ts` |
| `function add(a: number): number { … }` | `func add(a float64) float64 { … }` | `declaration/function.ts` |
| `function f<T>(x: T)` (générique) | `func f[T any](x T)` | `declaration/function.ts` |
| fonction sans annotation de retour | type de retour déduit par TS | `declaration/function.ts` |
| `async function f(): Promise<T>` | `func f() T` | `declaration/function.ts`, `type/promise.ts` |
| fonction qui ne renvoie rien (`void`) | `func f()` (pas de type de retour) | `declaration/function.ts` |
| fonction non-`void` qui finit par un `switch` exhaustif | `panic("unreachable")` ajouté en fin (exigé par Go, jamais atteint) | `expression/function.ts` |
| `function helper() {}` dans une fonction | `var helper func(); helper = func() { … }` | `statement/localFunction.ts` |
| `import { add } from "./add"` | `import "…/add.ts"`, puis `paquet.add` à l'usage ; un paquet Go par fichier TS | `common/identifier.ts`, `../transformSourceFile.ts` |
| import dont rien n'est écrit en Go | retiré (Go refuse un import inutilisé) | `../transformSourceFile.ts` |
| `type _check = …` (type seul) | rien | `../transformSourceFile.ts` |

## 4. Fonctions DuploJS

| TypeScript | Go | Fichier |
|---|---|---|
| `DEither.Success<T>` (type) | `EitherSuccess[T]` | `duplojs/either/success/index.ts` |
| `DEither.success(x)` | `EitherSuccessOf(x)` | `duplojs/either/success/index.ts` |
| `DEither.Fail` / `DEither.fail()` | `EitherFail` / `EitherFailOf()` | `duplojs/either/fail/index.ts` |
| `DEither.Left<I, T>`, `Right<I, T>`, `Error<T>` (types) | `EitherLeft[T]`, `EitherRight[T]`, `EitherError[T]` | `duplojs/either/variant/index.ts` |
| `DEither.left("info", v)`, `right(…)`, `error(…)` | `EitherLeftOf("info", v)`… (même JSON que DuploJS) | `duplojs/either/variant/index.ts` |
| `DEither.left("info")` (sans valeur) | `EitherLeftEmpty` : JSON sans clé `value` | `duplojs/either/variant/index.ts` |
| ⭐ `DEither.isRight(x)`, `isLeft(x)` | `x.Tag == 1 \|\| x.Tag == 3` (variantes du bon genre) ; constante si x n'est pas une union | `duplojs/either/isRight.ts` |
| `DEither.whenIsRight(x, f)` | une branche par variante : Right → `f(valeur)`, sinon x tel quel | `duplojs/either/whenIsRight.ts` |
| `DEither.whenIsRightOtherwise(x, f, g)` | Right → `f(valeur)`, sinon `g(x)` | `duplojs/either/whenIsRight.ts` |
| `DEither.unwrapRight(x)` | Right → sa valeur, sinon x tel quel | `duplojs/either/unwrapRight.ts` |
| `DEither.matchInformation(x, { "info": f, … })` | une branche par variante, le gestionnaire de son information | `duplojs/either/matchInformation.ts` |
| `DEither.rightPipe(x, s1, s2)` | fonction appelée sur place, `return` dès qu'une étape renvoie un Left | `duplojs/either/rightPipe.ts` |
| `DEither.rightAsyncPipe(…)` | comme `rightPipe` (modèle synchrone) | `duplojs/either/rightPipe.ts` |
| `DEither.group([…])`, `asyncGroup([…])` | boucle : premier Left = résultat, sinon `success([valeurs])` | `duplojs/either/group.ts` |
| forme curryfiée `DEither.whenIsRight(f)` | closure Go `func(input In) Out { … }` | `duplojs/curried.ts` |
| `DCommon.pipe(x, f, g)`, `asyncPipe(…)` | `g(f(x))` | `duplojs/common/pipe/index.ts` |
| `DCommon.print(x)` | `Print(x)` (affiche le JSON) | `duplojs/common/print/index.ts` |
| `DArray.map(t, f)` | `Map(t, f)` | `duplojs/array/map/index.ts` |
| `DArray.filter(t, f)`, `some`, `find`, `concat` | `Filter`, `Some`, `Find` (→ `Union2[JSUndefined, T]`), `Concat` | `duplojs/array/collection.ts` |
| `DArray.lengthEqual(t, n)` | `float64(len(t)) == n` | `duplojs/array/collection.ts` |
| `DArray.coalescing(x)` | `CoalescingValue(x)` → `[1]T{x}`, ou `CoalescingArray(x)` → x (choisi d'après le type) | `duplojs/array/coalescing/index.ts` |
| `DArray.reduce(t, départ, ({ next, exit }) => …)` | `Reduce(t, départ, func(p ReduceParams[T, A]) ReduceStep[A] { … })` | `duplojs/array/reduce.ts` |
| `DArray.reduceFrom(x)` | `x` | `duplojs/array/reduce.ts` |
| `DString.to(x)` | `NumberToString(x)` (écriture JS des nombres) ; une chaîne reste telle quelle | `duplojs/string/to/index.ts` |
| `DString.includes(t, s)` | `strings.Contains(t, s)` | `duplojs/string/index.ts` |
| `DString.test(t, /motif/)` | `motif.MatchString(t)` | `duplojs/string/index.ts` |
| `DString.length(t)` | `StringLength(t)` | `duplojs/string/index.ts`, `duplojs/string/length.ts` |
| `DString.padStart(t, n, c)` | `PadStart(t, n, c)` (longueurs UTF-16, comme JS) | `duplojs/string/padStart.ts` |
| les trois formes : `f(x, a)`, `f(a)(x)`, `pipe(x, f)` | même traduction, sous les trois formes | `duplojs/simpleFunction.ts` |
| une fonction DuploJS non traduite | refusée avec une erreur nommée | `duplojs/*/index.ts` |

## 5. API JavaScript intégrées

| TypeScript | Go | Fichier |
|---|---|---|
| `Math.round(x)` | `math.Floor(x + 0.5)` (arrondi JS, différent de `math.Round` de Go sur `-2.5`) | `expression/builtin.ts` |
| `Math.floor(x)`, `Math.ceil(x)`, `Math.abs(x)` | `math.Floor(x)`, `math.Ceil(x)`, `math.Abs(x)` | `expression/builtin.ts` |
| `Promise.resolve(x)` | `x` | `expression/builtin.ts` |
| une autre API intégrée | refusée : `un-support-builtin` | `expression/builtin.ts` |

## 6. Conversions automatiques entre types

Là où TypeScript accepte une valeur sans rien écrire, Go exige une conversion explicite. Toutes passent par `convertToType` (`type/union/index.ts`).

| Situation TypeScript | Go |
|---|---|
| un `number` là où `number \| undefined` est attendu | `Union2[JSUndefined, float64]{Tag: 1, V1: x}` |
| une union là où TS sait qu'il ne reste qu'un membre (rétrécissement) | `x.V1` |
| une union vers une union plus large ou plus étroite | fonction appelée sur place, une branche par variante |
| un objet `{ a, b }` là où un objet avec `c?` en plus est attendu | struct recopiée champ par champ, `c` à `undefined` |
| un objet là où une union d'objets est attendue | construit directement dans le bon membre de l'union |
| `[]` (tableau vide, type `never[]`) | slice vide du type attendu |
