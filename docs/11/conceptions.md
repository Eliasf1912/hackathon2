# Projet 11 : conception

## Le problème

`projects/11` n'a pas de `README.md`. Le programme valide un nom d'utilisateur et en mesure la longueur :

```ts
function checkUserName(username: string) {
	if (DString.test(username, /[0-9]/)) {
		return DEither.left("must-be-not-contain-number");     // Left sans valeur
	}
	if (DString.includes(username, "@")) {
		return DEither.error(null);
	}
	return DEither.right("valid-username", username);
}

function main() {
	const checkedUsername = DCommon.pipe("test", checkUserName, DEither.unwrapRight);

	if (DEither.isLeft(checkedUsername)) {
		return checkedUsername;          // TS : Left | Error (la chaîne est exclue)
	}

	return DCommon.pipe(checkedUsername, DString.length, DEither.success);  // TS : string
}

type _check = DCommon.ExpectType<ReturnType<typeof main>, …, "strict">;
```

`main()` n'est jamais appelée : le programme n'affiche rien, ni en TS ni en Go. Ce qu'il faut savoir traduire :

1. **le rétrécissement** (« narrowing ») : après `if (isLeft(x)) return x;`, TS sait que `x` est une `string`, alors que la variable Go reste une union ;
2. `DEither.isLeft` ;
3. `DEither.left("x")` **sans valeur** : en JS, `{"left":null,"information":"x"}`, sans clé `value` ;
4. `DEither.unwrapRight`, appelé ou **passé en valeur** à `pipe` ;
5. `DString.test` (expression régulière), `DString.includes`, `DString.length` ;
6. `type _check = …` : une déclaration de type seule.

## Résultat

11 compile, passe `go vet` et n'affiche rien, comme TS. Pour vérifier son comportement, la fixture `string-validation` exécute chaque chemin (nom valide, avec chiffre, avec `@`, emoji) et compare Go à JS.

`pnpm test` : **40 tests sur 40 au vert**, `tsc` passe, le lint passe sur **tout** le dépôt (y compris 11, reformaté par le linter : espaces → tabulations), `go vet` propre sur 00 à 11.

```go
Sourced_checkedUsername := Generated_11(Sourced_checkUserName(Generated_10))   // pipe + unwrapRight
if Sourced_checkedUsername.Tag == 0 || Sourced_checkedUsername.Tag == 1 {      // isLeft
	return …(Sourced_checkedUsername)    // rétrécie vers Left | Error, puis élargie vers le retour
}
Generated_13 := Sourced_checkedUsername.V2                                      // rétrécie vers string
```

## Les idées utilisées

### 1. Le rétrécissement se fait à la lecture de l'identifiant

Chaque lecture d'une variable ou d'un paramètre compare deux types Go :
- celui de sa **déclaration** (le type de la variable Go) ;
- celui que le checker donne **à cet endroit**.

S'ils diffèrent, la valeur est convertie (`convertToType`) : union → un de ses membres (`x.V2`), ou union → union plus étroite. Ainsi **tous** les consommateurs (`pipe`, `return`, appels, `print`) reçoivent le type attendu, sans rien changer chez eux. Effet de bord bienvenu : dans 01, `print(result)` dans `if (isRight(result))` reçoit désormais le `Success` typé.

Les conversions d'union ont été écrites lors de la revue de code (`docs/revues/2026-11-19-revue-02-10.md`).

### 2. `isRight` / `isLeft` par le genre de la variante

Le registre des variantes (06) connaît le genre de chaque type Go. Sur une union : un test de `Tag` pour les variantes du genre. Sur une valeur qui n'est pas une union : le genre est connu **à la compilation**, donc une constante (la valeur reste évaluée). Les méthodes `IsRight()` des variantes, devenues inutiles, ont été supprimées.

### 3. Variantes sans valeur

`Left<I, undefined>` et `Right<I, undefined>` deviennent `EitherLeftEmpty` / `EitherRightEmpty` : une struct sans champ `Value`, d'où un JSON sans clé `value`, comme JS. `omitzero` ne convenait pas : il omettrait aussi un `0` ou un `""`. La fabrique de variantes produit les deux formes ; `matchInformation` passe `JSUndefined{}` à leur gestionnaire, comme pour `Fail`.

### 4. `unwrapRight`, et une fonction générique passée en valeur

Une branche par variante : un Right donne sa valeur, toute autre variante reste telle quelle. Passé en valeur (`pipe(x, checkUserName, DEither.unwrapRight)`), il devient une fonction Go typée par la signature que le contexte instancie : `createCurriedFunction` accepte maintenant une signature donnée.

### 5. Fonctions « simples » sous leurs trois formes

`duplojs/simpleFunction.ts` traduit une fonction DuploJS qui est une simple fonction de ses arguments, sous ses trois formes : directe `f(data, …args)`, curryfiée `f(…args)` (la donnée vient en premier dans DuploJS), et passée en valeur. Il suffit de dire quoi produire :

| DuploJS | Go |
|---|---|
| `DString.includes(text, search)` | `strings.Contains(text, search)` |
| `DString.test(text, /motif/)` | `motif.MatchString(text)` |
| `DString.length(text)` | `shard_dependencies.StringLength(text)` |

`StringLength` compte des **unités UTF-16**, comme `.length` en JS (un emoji compte 2), et non des octets (`len`).

### 6. Expressions régulières : compilées une fois, traduites avec le sens JS

Un littéral `/motif/drapeaux` devient une variable de paquet `regexp.MustCompile("(?drapeaux)motif")`, compilée une seule fois au démarrage et partagée entre fichiers.

Le motif n'est **pas** passé tel quel : `translatePattern` (`expression/regularExpressionPattern.ts`) le parcourt et le réécrit avec le sens JS, car plusieurs constructions s'écrivent pareil mais ne veulent pas dire la même chose en RE2 (le moteur de Go) :

| JS | Problème en Go | Traduction |
|---|---|---|
| `.` | Go accepte `\r`, U+2028, U+2029 | `[^\n\r\x{2028}\x{2029}]` (ou tout caractère avec `s`) |
| `\s`, `\S` | ASCII seulement en Go | liste explicite des espaces JS (Unicode) |
| `[^]`, `[]` | `[^]` fait paniquer Go au démarrage | tout caractère / aucun |
| `\uXXXX`, `\u{…}` | inconnu de RE2 | `\x{…}` |

Ce que RE2 ne peut pas exprimer est refusé **à la transpilation** (pas de panique au démarrage) : assertions avant / arrière, références arrière, `\cX`, `\S` dans une classe, drapeaux `g` et `y` (qui rendent `test` dépendant d'un état).

### 7. Petits ajouts généraux

- **Intersection** : des membres qui donnent tous le même type Go (`string` et un gabarit de chaîne) donnent ce type. Un membre `import("@duplojs/lang/…").X`, que le checker écrit pour un module non importé par le fichier, est traité comme une contrainte (« shortcut » documenté).
- **Déclarations de type seules** (`type X = …`, `interface X`) : aucun Go produit.
- **Paquets standard** (`strings`, `math`) : importés une seule fois par fichier (`importStandardPackage`).
- **Aiguillage du domaine Either** : une `Map` nom → gestionnaire, au lieu d'une chaîne de `match` qui dépassait 16 arguments.

## Ce qui a été modifié (fichiers existants)

| Fichier | Changement |
|---|---|
| `src/transpiler/transformers/common/identifier.ts` | rétrécissement à la lecture |
| `src/transpiler/transformers/duplojs/either/isRight.ts` | `isRight` / `isLeft` par genre ; constante hors union |
| `src/transpiler/transformers/duplojs/either/index.ts` | `Map` de gestionnaires ; + `isLeft`, `unwrapRight` |
| `src/transpiler/transformers/duplojs/either/variant/` | formes sans valeur `…Empty` |
| `src/transpiler/transformers/duplojs/either/sharedDependency.ts`, `success/`, `fail/` | méthodes `IsRight()` supprimées |
| `src/transpiler/transformers/duplojs/curried.ts` | signature fournie possible |
| `src/transpiler/transformers/duplojs/string/index.ts` | + `includes`, `test`, `length` |
| `src/transpiler/transformers/type/intersection.ts` | membres de même type Go ; repli pour les imports DuploJS |
| `src/transpiler/transformers/type/literal.ts` | l'erreur indique le genre du littéral |
| `src/transpiler/transformers/expression/binary.ts` | `math` via `importStandardPackage` |
| `src/transpiler/transformSourceFile.ts` | déclarations de type ignorées |
| `package.json` | `build:11` |
| `projects/11/index.ts` | reformaté par le linter (espaces → tabulations, rien d'autre) |

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `src/transpiler/transformers/duplojs/either/unwrapRight.ts` | `DEither.unwrapRight` |
| `src/transpiler/transformers/duplojs/simpleFunction.ts` | fonctions simples : formes directe, curryfiée, en valeur |
| `src/transpiler/transformers/duplojs/string/length.ts` | `StringLength` (UTF-16) |
| `src/transpiler/transformers/expression/regularExpression.ts` | littéraux d'expression régulière |
| `src/transpiler/transformers/expression/regularExpressionPattern.ts` | motif JS → motif RE2 de même sens |
| `src/transpiler/transformers/shared/standardPackage.ts` | import d'un paquet standard Go |

Tests (locaux) : 11 dans les e2e ; nouvelle fixture `string-validation` comparée à JS : `checkUserName` sur trois noms, `measure` (la logique de `main`) sur quatre noms dont un emoji, `unwrapRight` direct, `isLeft` sur union et sur variante seule, drapeau `i`, formes curryfiées de `test` et `includes` dans `map`, `length` en valeur.

## Revue de code

Un relecteur indépendant a relu le diff de 11 en exécutant ses propres programmes. Rétrécissement, `isLeft` / `isRight`, `unwrapRight`, longueur UTF-16 et JSON des variantes sans valeur : identiques à JS. Constats corrigés :

| Constat (confirmé en l'exécutant) | Correction |
|---|---|
| `/[^]/` faisait paniquer Go au démarrage | `translatePattern` |
| `/a.b/` acceptait `"a\rb"` en Go, pas en JS | `.` traduit avec les fins de ligne JS |
| `/\s/` ne reconnaissait pas `\u00a0` en Go | `\s` / `\S` → espaces JS |
| `DEither.left("a", undefined)` : Go ne compilait pas (argument en trop) | forme sans valeur : `undefined` évalué (`_ = v`) mais non passé |

Chaque cas est rejoué dans la fixture `string-validation` ; le traducteur de motifs a son test unitaire (`tests/transpiler/regularExpressionPattern.test.ts`). **40 tests sur 40 au vert.**

## Limites connues

| Erreur ou effet | Cas |
|---|---|
| `un-support-regular-expression-syntax` | `(?=…)`, `(?!…)`, `(?<=…)`, `(?<!…)`, `\1`, `\k<nom>`, `\cX`, `\S` dans une classe |
| `un-support-regular-expression-flag` | `g`, `y`, `d`, `v` |
| (sémantique) | RE2 travaille sur des runes, JS (sans `u`) sur des unités UTF-16 : un emoji compte pour un caractère en Go, deux en JS ; `(?i)` de Go suit les règles Unicode de casse |
| `un-support-includes-as-value`, `un-support-test-as-value` | `includes` / `test` passés eux-mêmes en valeur (deux paramètres) |
| (performance) | rétrécir puis élargir une union (`return x` après `isLeft`) passe par deux conversions ; une seule suffirait |

## Questions ouvertes

1. **Fusionner rétrécissement et conversion** : `return x` après `isLeft(x)` convertit `Union3 → Union2` puis `Union2 → Union3`. La conversion directe `Union3 → Union3` (avec la variante impossible en `panic`) serait plus courte.
2. **Ré-affectation** : le rétrécissement compare le type déclaré au type à l'endroit ; quand l'affectation `x = …` sera traduite, il faudra vérifier que la variable Go garde bien son type déclaré.
