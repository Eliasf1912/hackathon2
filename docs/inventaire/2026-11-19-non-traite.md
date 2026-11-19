# Ce que le transpileur ne traite pas encore (19/11/2026)

Objectif : traduire **tous** les programmes DuploJS, pas seulement les exercices 00 à 11. Cet inventaire mesure l'écart, à partir de deux références.

- **L'API de `@duplojs/lang`** : chaque domaine importé à l'exécution, puis ses fonctions exportées listées (624 fonctions, 16 domaines).
- **Un vrai projet DuploJS** : le code source du transpileur lui-même (`src/`, 270 fichiers), écrit en DuploJS. On y compte les fonctions DuploJS utilisées et les genres de nœuds TypeScript présents. C'est la meilleure mesure dont on dispose de ce qu'un « programme complet » contient vraiment.

## Mise à jour après le projet 12

Les chiffres ci-dessous datent d'**avant** 12 ; ils n'ont pas été recomptés. Depuis, pour que 12 (programme MVC complet) compile et affiche la même chose qu'en TS, ont été traduits (voir `docs/12/conceptions.md`) :

- **Objets** (point 1 de l'ordre proposé, fait) : objets littéraux, décomposition `...x`, `interface` et `type X = { … }` en structs Go (alias, génériques compris), champs optionnels, `Record<string, T>`, accès `obj.champ` avec le rétrécissement, déstructuration d'objet (paramètres et variables).
- **Syntaxe** : `??`, `x === undefined` / `null` sur une union, accès par index sur un dictionnaire, `switch`, `for…of`, affectations, fonctions locales, fonctions `void`, paramètres optionnels, fonctions génériques `function f<T>`.
- **Types** : `ReturnType`, `Awaited`, `Parameters`, `InstanceType`, `NonNullable`, `Readonly`, `Promise<T>` (modèle synchrone de 10).
- **DuploJS** : `DArray.filter`, `some`, `find`, `concat`, `lengthEqual`, `reduce`, `reduceFrom` ; `DString.padStart` ; `Math.round`, `floor`, `ceil`, `abs`, `Promise.resolve`.

Toujours à faire, dans l'ordre proposé (point 5) : `?.`, ré-exportations, générateurs et boucles `while`, `new` (`Map`, `Set`), le reste des domaines DuploJS (`modeling`, `pattern`, `common.cast` / `memo`…).

## 1. En chiffres

| Mesure | Traité | Total | Part |
|---|---|---|---|
| Fonctions de `@duplojs/lang` | 24 | 624 | 4 % |
| Fonctions DuploJS utilisées par un vrai projet (`src/`) | 22 | 88 | 25 % |
| Appels à ces fonctions dans `src/` | 651 | 1 209 | 54 % |

Les 54 % viennent surtout de `isLeft` (178 appels) et `unwrapRight` (174), déjà traduites. Les 66 fonctions restantes pèsent 558 appels.

Fonctions traduites aujourd'hui :
- **either** (15) : `success`, `fail`, `left`, `right`, `error`, `isRight`, `isLeft`, `whenIsRight`, `whenIsRightOtherwise`, `unwrapRight`, `matchInformation`, `rightPipe`, `rightAsyncPipe`, `group`, `asyncGroup` ;
- **string** (4) : `to`, `includes`, `test`, `length` ;
- **common** (3) : `print`, `pipe`, `asyncPipe` ;
- **array** (2) : `map`, `coalescing`.

## 2. Syntaxe TypeScript non traitée, par fréquence dans un vrai projet

La syntaxe déjà traduite : déclarations de fonction et de variable, `return`, `if` / `else`, appels, littéraux, opérateurs arithmétiques, de comparaison et logiques (`&&`, `||`), unaires `-` / `!`, ternaire, gabarits, tableaux et tuples, fonctions fléchées, `await`, déstructuration de tuple en paramètre.

| Construction | Occurrences dans `src/` | Ce qu'il faudrait | Difficulté |
|---|---|---|---|
| **Objets littéraux** `{ a: 1, b }` (`ObjectLiteralExpression`, `PropertyAssignment`, `ShorthandPropertyAssignment`) | 615 objets, 1 417 propriétés | struct Go, typée par le checker (le type d'objet donne les champs) | **élevée** : c'est la pièce centrale manquante |
| **Accès à un champ** `obj.champ` (`PropertyAccessExpression` hors référence DuploJS) | une grande part des 3 771 accès | sélecteur Go sur la struct (`obj.Champ`), avec le rétrécissement | moyenne, une fois les objets en place |
| **Types d'objet** : `interface`, `type X = { … }` (`InterfaceDeclaration` 129, `PropertySignature` 354, `TypeLiteral` 16) | 499 | type struct Go nommé ; JSON avec les noms de champs TS | élevée (liée aux objets) |
| **Déstructuration d'objet** `({ a, b }) =>`, `const { a } = x` (`ObjectBindingPattern` 106, `BindingElement` 215) | 321 | liaisons par champ, comme les tuples en 08 | faible, une fois les objets en place |
| **Ré-exportations** `export * from`, `export { x }` (`ExportDeclaration` 194) | 194 | résolution d'un symbole ré-exporté vers son paquet Go d'origine | moyenne |
| **Fonctions génériques** `function f<T>(…)` (`TypeParameter` 31) | 31 | fonction générique Go, ou instanciation par appel | élevée |
| **`??`** (29) et **`?.`** (12) | 41 | test sur `JSNull` / `JSUndefined`, comme le court-circuit de `&&` | moyenne |
| **Décomposition** `...x` (`SpreadElement` 23, `SpreadAssignment` 10) | 33 | `append` pour un tableau ; copie de champs pour un objet | moyenne |
| **`new`** (`NewExpression`, 17) : `Map`, `Set`, `Error` | 17 | types Go équivalents (`map`, ensemble, erreur) | moyenne |
| **Accès par index** `x[i]`, `x["clé"]` (`ElementAccessExpression`, 15) | 15 | index Go (avec la sémantique JS de l'index hors limites : `undefined`) | moyenne |
| **`as` / `satisfies`** (19) | 19 | ignorés (vérifiés par TS) ; `as` vers un type plus étroit = conversion | faible |
| **Affectation et affectation composée** `x = …`, `x += …` (14) | 14 | affectation Go ; le rétrécissement doit en tenir compte | moyenne |
| **Boucles** `for…of`, `while`, `continue` (10) | 10 | `for … range`, `for` ; DuploJS préfère les générateurs | faible à moyenne |
| **`BigInt`** (13) | 13 | `math/big` ou `int64` selon les contraintes | moyenne |
| **Gabarits étiquetés**, `typeof`, `in`, `instanceof`, noms de propriété calculés | < 25 | au cas par cas | variable |
| **Types conditionnels / mappés**, `keyof`, accès indexé sur un type | ~10 | rien à l'exécution, mais le type Go doit être calculé : on passe par le type que donne le checker | faible |

Le projet ne contient **aucune classe** (`ClassDeclaration` absent) : le style DuploJS (objets « taggés », fonctions) l'évite. Il ne faut donc pas en faire une priorité.

## 3. Fonctions DuploJS non traitées, par fréquence dans un vrai projet

| Domaine | Fonctions (appels dans `src/`) |
|---|---|
| **array** | `concat` 53, `lengthEqual` 30, `filter` 28, `find` 23, `first` 21, `flatMap` 12, `some` 9, `slice` 8, `reduceFrom` 8, `reduce` 6, `push` 6, `last` 6, `at` 5, `minElements` 3, `from` 3 |
| **modeling** (objets « taggés ») | `createTaggedObjectFactory` 78, `hasTagValue` 29, `taggedObject` 9 |
| **common** | `cast` 44, `memo` 24, `promiseAll` 17, `equal` 14, `createEnum` 6 |
| **pattern** | `match` 14, `otherwise` 4 |
| **printer** | `renderLine` 18, `renderParagraph` 5 |
| **path** | `resolveFrom` 6, `createAbsolute` 5, `declarePath` 3, `getParentFolderPath` 2, `computeRelative` 2 |
| **generator** | `reduceFrom` 5, `asyncReduce` 3, `reduce` 2 |
| **either** | `none` 6, `some` 3, `safeCallback` 2 (Maybe : `some` / `none` ne sont pas dans le registre des variantes) |
| **string** | `padStart` 3, `startsWith` 2 |

Domaines entiers à zéro : **chrono** (87 fonctions : dates et durées), **dataStructure** (136), **object** (22), **number** (22), **invocation** (26), **kind** (7), **tuple** (2).

**Ce qui est déjà simple à étendre** : une fonction « simple » de ses arguments (`DString.startsWith`, `padStart`, `DArray.first`, `last`, `at`…) se traduit en quelques lignes avec `simpleFunctionHandler` (11). Une fonction qui reçoit une fonction (`filter`, `find`, `some`, `flatMap`, `reduce`) suit le modèle de `map` (05). Ce sont des ajouts **mécaniques**, à faire par lot.

## 4. Limites déjà déclarées dans le code

Le code contient **78 erreurs nommées** (`un-support-…`) : ce qui est reconnu mais refusé, plutôt que traduit faux. Les plus structurantes :

| Erreur | Cas |
|---|---|
| `un-support-heterogeneous-or-empty-tuple` | `[number, string]` (prévu : struct `TupleN` avec JSON en tableau) |
| `un-support-type-conversion` | conversion entre types sans variante commune ; tuple `[N]T` vers tableau `T[]` |
| `un-support-variable-destructuring` | `const [a, b] = x` au niveau du fichier (`const a = 1, b = 2` est traduit, dans une fonction comme au niveau du fichier) |
| `un-support-non-boolean-condition` | « truthiness » JS : `if (valeur)` sur un nombre, une chaîne… |
| `un-support-map-index-params` | `map((element, { index }) => …)` : demande les objets |
| `un-support-group-object` | `group({ a, b })` : demande les objets |
| `un-support-bitwise-operator` | `&`, `|`, `^`, `<<`, `>>`, `>>>` (sémantique entier 32 bits de JS) |
| `un-support-regular-expression-syntax` / `-flag` | assertions, références arrière ; drapeaux `g`, `y` |
| `un-support-generator-function` | `function*` (DuploJS utilise beaucoup les générateurs : domaine `generator`) |

Et les écarts de sens connus, sans erreur :
- le modèle asynchrone synchrone (10) : un effet entre la création d'une promesse et son `await` change d'ordre ;
- les expressions régulières comptent un emoji comme un caractère (deux en JS).

## 5. Ordre proposé

La quasi-totalité du code réel manipule des **objets**. Sans eux, on ne peut traduire ni les types `interface`, ni la déstructuration d'objet, ni `map` avec index, ni `group({…})`, ni `DModeling` (les objets « taggés » de DuploJS, 116 appels). C'est le verrou principal.

1. **Objets** : objets littéraux, types d'objet → structs Go avec JSON, accès `obj.champ`, déstructuration d'objet, `??` et `?.` (champs optionnels). Débloque aussi `DModeling` et `DObject`.
2. **Fonctions DuploJS par lot** : `array` (`concat`, `filter`, `find`, `first`, `some`, `reduce`…), `common` (`cast`, `memo`, `equal`), `string` (`startsWith`, `padStart`…), sur les modèles existants (`simpleFunctionHandler`, `map`).
3. **Modules** : ré-exportations (`export * from`), nécessaires dès qu'un projet a plus d'un niveau de fichiers.
4. **Générateurs** (`function*`, domaine `generator`) et **boucles**.
5. **Fonctions génériques** (`function f<T>`).
6. Le reste, au fil des besoins : `new` (`Map`, `Set`), `BigInt`, opérateurs sur les bits, `chrono`, `dataStructure`.

À valider avant le point 1 (vraie décision de conception) : la forme Go d'un objet TS. Struct nommée par type d'objet (le plus rapide, mais il faut nommer les types anonymes), ou struct anonyme (pas de méthodes, donc pas de `MarshalJSON`).
