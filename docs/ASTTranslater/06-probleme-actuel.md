# 6. Le problème actuel : des transformers incomplets

## Contexte : pourquoi ces exercices existent

Tous les exercices (`projects/00` à `projects/10`) utilisent la bibliothèque **DuploJS** (`@duplojs/lang`). Le but n'est pas seulement de faire passer 11 exercices : il s'agit de **réunir des preuves pour décider si la transformation complète d'un projet DuploJS en Go est possible**.

### L'hypothèse

Une telle conversion semble possible parce que **DuploJS est très fortement typé**, notamment pour les **erreurs**. Elles ne sont pas levées comme exceptions mais renvoyées comme valeurs (`Either`). Le code d'un projet DuploJS dit donc, dans ses types, tout ce qui peut arriver. C'est précisément l'information dont un transpiler vers un langage statiquement typé a besoin.

### Pourquoi Go : la performance

**Le but de la conversion est de gagner en performance grâce à Go.** Il ne suffit donc pas que le Go généré compile et donne le bon résultat : il doit aussi exploiter ce qui rend Go rapide, à savoir **des types concrets connus à la compilation**.

> **Règle : pas de `any` (ni `interface{}`) pour représenter les valeurs.**
> On utilise des `struct`, des types de base (`float64`, `string`, `bool`), des slices typées (`[]float64`) et des génériques **instanciés** (`EitherSuccess[float64]`).
> Une traduction qui passe par `any` compile et peut donner le bon résultat, mais **elle fait perdre l'intérêt de la conversion**. Elle doit être considérée comme un **échec** pour l'étude de faisabilité.

Pourquoi `any` coûte cher en Go :
- chaque valeur rangée dans un `any` est **emballée** (souvent une allocation sur le tas) ;
- chaque lecture demande une **vérification de type à l'exécution** (`x.(float64)`, `type switch`) ;
- le compilateur ne peut plus **optimiser** (inlining, disposition mémoire des structs) ;
- on retombe sur le modèle dynamique de JavaScript, c'est-à-dire exactement ce qu'on cherche à quitter.

Exemple, pour `DEither.success(one + two)` :

```go
// ✅ ce qu'on veut : struct concrète, type de la valeur connu
type EitherSuccess[T any] = struct {
	Right       JSNull
	Information string
	Value       T          // ← float64 une fois instancié : pas d'emballage
	Success     JSNull
}
shard_dependencies.EitherSuccessOf[float64](Generated_7)

// ❌ à éviter : fait perdre l'intérêt de Go
type Either struct {
	Information string
	Value       any        // ← emballage + vérification de type à chaque lecture
}
```

C'est **le typage fort de DuploJS qui rend ça possible** : le type checker TypeScript connaît le type exact de chaque valeur (`Success<number>`, `Left<"negative-operand", number>`…). Le transpiler peut donc toujours choisir un type Go concret au lieu de `any`.

Conséquences sur les choix de conception :

| Sujet | Choix compatible avec la performance | À éviter |
|---|---|---|
| Valeur d'un Either | struct générique **instanciée** (`EitherSuccess[float64]`) | `Value any` |
| Fonctions génériques DuploJS (`map`, `whenIsRight`…) | génériques Go instanciés avec les types résolus par le checker, ou une version concrète par type utilisé (monomorphisation) | paramètres et retours en `any` |
| **Unions** (`Success<number> \| Fail`) | ⚠️ **à arbitrer** : une **interface** (+ `type switch`) reste typée mais implique un emballage et un appel dynamique ; une **struct unique** qui porte tous les cas, discriminée par `Information` (la forme JSON des Either), évite l'emballage | `any` + assertions de type |
| Tableaux | slices typées (`[]float64`) | `[]any` |
| Objets littéraux | `struct` dédiée | `map[string]any` |

### Stratégie de repli : « `any` guidé par TS »

> **À n'utiliser que si aucun type Go concret n'est possible.** L'objectif reste de ne jamais en avoir besoin.

**L'idée :** le contrôle de typage a **déjà été fait par TypeScript**. Si une valeur doit passer par un `any` en Go, on sait quand même, grâce au checker, quel est son type à chaque endroit où elle est utilisée. Une assertion de type Go vers ce type **ne peut donc pas échouer** : elle ne vérifie rien, elle **traduit la preuve TS**.

```go
var person any = user          // repli : la valeur passe par un any
name := person.(User).Name     // sûr : TS a prouvé qu'ici, person est un User
```

**Les règles :**

1. **Assertion vers le type précis donné par le checker à cet endroit** (`getTypeAtLocation`), qui tient compte du *narrowing* (dans un `if (isRight(x))`, `x` est un `Success<…>`).
2. **Attention au typage structurel.** TS ne prouve pas qu'une valeur *est* la struct `User`, mais qu'elle *a la forme* attendue :
   ```ts
   function getName(person: { name: string }) { return person.name; }
   getName(user); getName(admin); getName({ name: "x" });   // trois structs Go différentes
   ```
   Quand le type à cet endroit est une **forme anonyme**, une assertion vers une struct **paniquerait**. Il faut alors une **interface d'accesseurs** générée (`interface { GetName() string }`), avec la méthode ajoutée à chaque struct qui a ce champ.
3. **Valable seulement si la preuve TS est intacte.** Les échappatoires du code source la désactivent : `as`, `any`, `@ts-ignore`, `!` (non-null). Le transpiler doit les **détecter** sur le chemin concerné, puis les refuser ou les signaler. Le style DuploJS les déconseille (la doc des contraintes dit « ne pas forcer avec des casts », et les données externes passent par `DataStructure.check`). La preuve TS est donc **plus fiable** dans un projet DuploJS que dans un projet TS ordinaire.
4. **Sûr, mais pas rapide.** L'assertion coûte presque rien (une comparaison), mais **ranger** la valeur dans le `any` coûte une allocation et des optimisations perdues. C'est un filet de sécurité, pas une stratégie normale.
5. **Chaque repli est compté.** Le nombre de replis par projet est une **mesure de l'étude de faisabilité** : quelques-uns, l'hypothèse tient ; des centaines, la conversion perd son intérêt.

**Lien avec le *narrowing* :** traduire un usage par une assertion vers le type TS **à cet endroit** est la même mécanique, que la variable Go soit un `any` (repli) ou une interface (`Either`, pour une union rétrécie par un `if`). Un seul mécanisme, deux usages.

**Cas candidats repérés** (à vérifier, peut-être évitables) :
- tuples hétérogènes (exercice 08) : une struct par forme de tuple suffit probablement ;
- données externes (`JSON.parse`, API) : en DuploJS, elles sont validées par `DataStructure` avant usage, donc leur type est connu après le check.

### Ce qui joue en faveur

| Caractéristique de DuploJS | Pourquoi ça aide la conversion vers Go |
|---|---|
| **Les erreurs sont des valeurs (`Either`), pas des exceptions** | Le flux de contrôle est explicite et visible dans les types. C'est la philosophie de Go (`return value, err`). Pas besoin de traduire des `try/catch`. |
| **Les informations sont des littéraux** (`"negative-operand"`, `"success"`) | Tous les cas possibles sont connus à la compilation. `matchInformation` peut devenir un `switch`, avec l'exhaustivité garantie par TS. |
| **Forme runtime stable (les kinds)** | Un Either a une forme JSON fixe (`@duplojs/lang/kind/@DuplojsLangEither/…`). Des structs Go avec tags JSON la reproduisent à l'identique (déjà fait pour `EitherSuccess`). |
| **Les contraintes n'existent que dans les types** (`number & DNumber.Int`) | Selon la doc DuploJS, elles ne modifient ni ne valident la valeur. On peut donc les **effacer** à la conversion. |
| **Données immuables** | Pas d'alias ni de mutation partagée à reproduire. |
| **Tout passe par des fonctions typées** (`pipe`, `map`, `whenIsRight`…) | Le type checker connaît le type exact à chaque appel (`getResolvedSignature`), ce qui permet de choisir le bon type Go (ex. `EitherSuccessOf[float64]`). |

### Les difficultés à évaluer, et l'exercice qui les teste

| Difficulté | Pourquoi c'est dur | Testé par |
|---|---|---|
| **Les unions** (`Success<number> \| Fail \| Left<"x", number>`) | Go n'a pas de type somme : interface + `type switch`, ou struct portant tous les cas. Ce choix conditionne tout le reste. | 01, puis 04 et 06 (unions inférées) |
| **Des génériques TS bien plus riches que ceux de Go** | TS calcule des types complexes (conditionnels, `MaxElements<3>`, intersections). Go n'a que des génériques simples. Il faudra probablement **monomorphiser** : une version concrète par type utilisé, à partir des types résolus par le checker. | 02, 03, 05, 08 |
| **Les fonctions comme valeurs** (`DArray.coalescing`, `DString.to` en argument) | Une fonction générique passée comme valeur doit être instanciée en Go (même problème que `EitherSuccessOf`, en plus fréquent). | 02, 05, 07 |
| **La forme curifiée** (`whenIsRight(f)` ou `whenIsRight(x, f)`) | Deux signatures pour une même fonction : il faut distinguer la surcharge appelée (le checker le permet). | 03 |
| **La taille de la bibliothèque runtime** | Chaque fonction DuploJS utilisée doit avoir son implémentation Go dans `shard_dependencies`. DuploJS en compte des centaines. **C'est le principal risque de faisabilité à grande échelle.** | tous |
| **L'asynchrone** (`async`, `Promise`, `await` de haut niveau) | Go n'a pas de promesses : goroutines et channels, ou exécution synchrone. | 10 |
| **Les exceptions qui restent** | DuploJS les réduit sans les supprimer : variantes `…OrThrow`, `asserts`, API natives (`JSON.parse`…). | aucun exercice pour l'instant |
| **Typage structurel vs nominal** | En TS, deux objets de même forme sont compatibles. En Go, les types sont nominaux. | 06 (objets littéraux), 08 (tuples) |

### Piste pour le risque principal

La source de DuploJS est disponible (`ecosystem/`). Si son code interne respecte lui aussi le style DuploJS (Either, pas de `any`, peu d'API natives), on pourrait **transpiler la bibliothèque elle-même** au lieu de réécrire chaque fonction en Go. La question deviendrait alors : « le transpiler sait-il se transpiler lui-même ? ». **Non vérifié** : il faut examiner le code de `@duplojs/lang`.

### Principe : toujours une solution générale

**On ne propose jamais une solution valable uniquement pour un exercice.** Les exercices ne sont pas isolés : chacun doit faire émerger des **pistes générales** (amélioration, implémentation, développement) qui rapprochent de la **meilleure solution générale** du transpiler.

Pour chaque problème rencontré, la question n'est pas « comment faire passer cet exercice ? » mais « comment traduire **ce type de construction, dans n'importe quel programme** ? ».

| ❌ Solution propre à un exercice | ✅ Solution générale |
|---|---|
| un type Go nommé d'après la fonction (`AddResult`) | un nom **canonique** dérivé de la structure de l'union : la même union donne partout le même type Go |
| `result := …` dans `init()` « parce que ça suffit ici » | variable de module déclarée au niveau du package (type explicite) + affectation dans `init()` : visible par les fonctions et les autres fichiers |
| `isRight` = test du seul type `EitherSuccess[float64]` | une interface commune à tous les Either (`IsRight()`, `Information()`) |
| instancier `EitherSuccessOf[T]` seulement pour `success` | instanciation de **toute** fonction générique dans `callExpressionTransformer` |

Un raccourci accepté temporairement doit être **signalé comme tel** (limite connue), jamais présenté comme la solution.

### Ce qu'il faut noter à chaque exercice

Pour que les exercices servent à conclure, chaque exercice terminé devrait laisser une trace :
- les **pistes générales** que l'exercice a fait émerger, et les choix généraux qu'il valide ou remet en cause ;
- le **choix de traduction** fait (ex. « union : interface + type switch ») ;
- si le Go généré reste **sans `any`** (types concrets partout). Sinon : combien de replis « `any` guidé par TS », pourquoi, et quel est le coût ;
- ce qui a **marché sans effort** (argument en faveur) ;
- les **limites** rencontrées et leur gravité : bloquant, contournable ou coûteux.

---

## En une phrase

Le **squelette** du transpiler est complet : CLI, lecture de l'arbre TS, mécanique `context.transform`, AST Go, printer, organisation de `dist/`. Mais il n'existe des **transformers que pour les nœuds du projet 00**. Dès qu'un exercice utilise un autre type de nœud, le build échoue avec **`notfound-transformer`**.

## Ce qui fonctionne aujourd'hui

| Pièce | État |
|---|---|
| CLI (`bin/index.ts`), `build`, `transformSourceFile`, `createFile` | ✅ complet |
| AST Go (`src/go/AST/`) + printer | ✅ très complet (`if`, `for`, `switch`, struct, interface, fonctions anonymes…) |
| Shared dependencies (`JSNull`, `JSUndefined`, `EitherSuccess`) | ✅ mécanisme en place |
| **Transformers** | ⚠️ **seulement ceux du projet 00** |

### Les transformers existants

| Transformer | Gère | Fichier |
|---|---|---|
| `functionDeclarationTransformer` | `function f(a: T) { … }` (nommée, avec corps) | `declaration/function.ts` |
| `blockStatementTransformer` | `{ … }` | `statement/block.ts` |
| `returnStatementTransformer` | `return expr` (avec une valeur) | `statement/return.ts` |
| `callExpressionTransformer` | `f(a, b)`, et `f(a, b);` seul sur sa ligne | `shared/call.ts` |
| `identifierTransformer` | `x` (local ou importé d'un fichier du projet) | `common/identifier.ts` |
| `numericLiteralTransformer` | `12` → `float64(12)` | `expression/numericLiteral.ts` |
| `binaryExpressionTransformer` | `+ - * / % & \| ^ << >> && \|\| === !== < <= > >=` | `expression/binary.ts` |
| `float64TypeTransformer` | type `number` → `float64` | `type/float.ts` |
| `duploJSEitherExpressionTransformer` | **uniquement** `DEither.success(…)` | `duplojs/either/` |
| `duploJSEitherTypeTransformer` | **uniquement** le type `DEither.Success<T>` | `duplojs/either/` |

Les autres fonctions DuploJS (`DEither.isRight`, `fail`, `left`, `whenIsRight`…, `DCommon.print`, `pipe`…, `DArray.*`, `DString.*`) déclenchent soit `notfound-transformer`, soit **`transformation-error`**. En effet, `duploJSEitherExpressionTransformer` prend tout nœud venant de `@duplojs/lang/either` et appelle `context.error` pour tout ce qui n'est pas `success`.

## L'erreur réelle de `build:01`

```
information: 'notfound-transformer'
kind:        'FirstStatement'          ← alias de VariableStatement
parentKind:  'SourceFile'
text:        'const result = add(1, 2);'
filePath:    '…/projects/01/index.ts'
```

Comment la lire :
- **`notfound-transformer`** : aucun transformer de la liste n'a pris le nœud ;
- **`kind`** : le type du nœud à gérer (`FirstStatement` = `VariableStatement`, voir [03-arbre-typescript.md](03-arbre-typescript.md#kinds-rencontrés-dans-les-exercices)) ;
- **`parentKind`** : où il se trouve (ici, directement dans le fichier) ;
- **`text`** : le code concerné.

Le build s'arrête à la **première** erreur. Il ne dit donc pas tout ce qui manque, seulement le prochain obstacle. Le `if` qui suit n'a pas encore été atteint.

## Les tests (TDD)

Les tests de bout en bout sont dans `tests/e2e/` (vitest) :

```bash
pnpm test         # une exécution
pnpm test:watch   # relance à chaque modification (cycle TDD)
```

Pour chaque projet listé dans `tests/e2e/projects.test.ts` :
1. **l'oracle** : le `index.ts` du projet est exécuté, et chaque valeur passée à `DCommon.print` est capturée puis convertie en JSON ;
2. le projet est **transpilé** avec le vrai CLI vers `tests/e2e/dist/<projet>/` (ignoré par git, conservé pour inspection) ;
3. le Go est **compilé et exécuté** (`go run .`), et chaque ligne affichée doit être une valeur JSON ;
4. les deux listes de valeurs doivent être **identiques**.

Chaque échec indique son étape :

| Échec | Sens |
|---|---|
| `transpilation-failed` (avec `notfound-transformer`, `kind`, `text`) | un transformer manque ou échoue |
| `go-run-failed` (avec l'erreur du compilateur Go) | le transformer produit du Go invalide |
| `go-output-not-json` | le Go n'affiche pas du JSON |
| différence de valeurs | le Go compile, mais ne fait pas la même chose que le TS |

Pour commencer un exercice, on ajoute son numéro à la liste `projects` : le test est **rouge**. L'exercice est terminé quand il passe au **vert**, et que le Go généré respecte la règle « pas de `any` » (à vérifier en relisant `tests/e2e/dist/<projet>/`).

Durée : environ 5 s par projet (démarrage du compilateur TS 7 + compilation Go).

## La démarche pour chaque exercice

```
1. lire projects/NN/README.md          (le problème et le Go attendu)
2. pnpm test (ou pnpm build:NN)         (build:NN n'existe que pour 00 et 01)
3. lire l'erreur : kind + text
4. coller le code dans ts-ast-viewer    (voir la forme du nœud et ses propriétés)
5. écrire le transformer dans le bon dossier (s'inspirer d'un transformer proche)
6. l'ajouter à la bonne liste (statementTransformers, expressionTransformers…)
7. recommencer à 2, jusqu'à ce que le build passe
8. cd projects/NN/dist && go run .      (le Go doit compiler et donner le bon résultat)
```

## Ce que chaque exercice introduit

Relevé **en lisant le code** de `projects/NN/*.ts`. C'est une estimation : seul le build fait foi. Chaque ligne liste ce qui est **nouveau** par rapport aux exercices précédents.

| Exercice | Nouveaux nœuds / fonctions à gérer |
|---|---|
| **01** | `VariableStatement` (`const result = …`) · `IfStatement` · `DEither.isRight(x)` · `DCommon.print(x)` · type de retour **union** `DEither.Success<number> \| DEither.Fail` (type `UnionType` + type `Fail`) |
| **02** | `DEither.whenIsRight(result, f)` (forme directe) · une **fonction passée comme valeur** : `DArray.coalescing` |
| **03** | `DCommon.pipe(x, …)` · `DEither.whenIsRight(f)` en forme **curifiée** |
| **04** | `if` **dans une fonction** · `===` dans une condition · `DEither.fail()` · nombre négatif `-1` (`PrefixUnaryExpression`) · type de retour **déduit** (union inférée par le type checker) |
| **05** | `DEither.whenIsRightOtherwise(f, g)` · fonction fléchée `() => [-12]` (`ArrowFunction`) · tableau littéral (`ArrayLiteralExpression`) · `DArray.map(f)` · `DString.to` |
| **06** | `DEither.left("negative-operand", v)` (Left avec information personnalisée) · `\|\|`, `<` · ternaire `a ? b : c` (`ConditionalExpression`) · `DEither.matchInformation(x, { … })` avec un **objet littéral** (`ObjectLiteralExpression`, clés chaînes) · chaînes (`StringLiteral`) |
| **07** | plusieurs fichiers importés (`divide.ts`) · `/` · `DEither.rightPipe(x, f)` · fonction fléchée **avec paramètre** |
| **08** | annotation de type `[number, number, number][]` (`ArrayType` de `TupleType`) · tableau de tableaux · **déstructuration** `([one, two, divisor]) => …` (`ArrayBindingPattern`) · `DArray.map(tableau, f)` en forme directe |
| **09** | `DEither.group(tableau)` |
| **10** | `async function` · `DEither.rightAsyncPipe` · `DEither.asyncGroup` · `DCommon.asyncPipe` · `*` · **`await` de haut niveau** (`AwaitExpression`) · promesses |

## Points d'attention (pièges repérés dans le code)

### 1. Les fonctions génériques stockées dans une variable

`callExpressionTransformer` met **toujours** la fonction appelée dans une variable (`Generated_N := f`). En Go, une fonction **générique** ne peut pas être stockée sans être instanciée : `f[T]`.

C'est le bug corrigé pour `success` : `successExpressionHandler` demande au type checker le type de retour de l'appel (`getResolvedSignature` → `getReturnTypeOfSignature` → `typeToTypeNode`) et produit `EitherSuccessOf[float64]` avec `GoAST.createInstantiationExpression`.

**Le même problème reviendra pour chaque fonction runtime générique** (`isRight`, `fail`, `left`, `whenIsRight`…). Deux options :
- refaire la même chose dans chaque handler ;
- ou généraliser ce calcul dans `callExpressionTransformer`.

### 2. Les variables de haut niveau et l'ordre `before` / `init`

`transformSourceFile` range un résultat au **niveau du package** s'il appartient au groupe `declaration`. Or `GoAST.VariableDeclarationInitialized` (`var x = …`) est **à la fois** déclaration et statement. Ses `before` (`Generated_N := …`) partent pourtant dans `init()`.

Si un transformer de `const` renvoie un `var x = Generated_3`, la déclaration sera au niveau du package mais `Generated_3` n'existera que dans `init()`. **Le Go ne compilera pas.**

Pour un `const` de haut niveau, il faut choisir une forme cohérente. Par exemple :
- un `ShortVariableDeclarationStatement` (`x := …`, qui reste dans `init()`) ;
- **mais** `x` doit alors être visible par le reste du fichier : attention si une fonction déclarée au niveau du package l'utilise.

C'est un choix de conception à faire dès l'exercice 01.

### 3. Le corps d'un `if` Go doit être un bloc

`GoAST.IfStatement.body` est typé `BlockStatement`. En TS, `thenStatement` peut être un statement seul (`if (a) return x;`). Il faut alors l'envelopper dans un bloc. De même, `elseBranch` doit être un `BlockStatement` ou un `IfStatement`.

### 4. La condition d'un `if` doit être un `bool` Go

`DEither.isRight(result)` doit produire une expression Go de type `bool`. Et les `before` de la condition doivent être placés **avant le `if`**, pas dedans.

### 5. Les unions de types

Go n'a pas d'union de valeurs. `Success<number> | Fail` doit être représenté autrement : une interface commune, ou une struct qui porte tous les cas… Le README de l'exercice 01 pose précisément cette question. La forme JSON des Either DuploJS doit rester identique (les clés `@duplojs/lang/kind/@DuplojsLangEither/…`, voir ci-dessous).

### 6. Garder la forme runtime des Either

Les structs Go de `shard_dependencies` reproduisent la forme JSON des Either DuploJS. Pour vérifier la forme attendue d'une nouvelle variante :

```bash
node -e 'import("@duplojs/lang/either").then(E => console.log(JSON.stringify(E.fail())))'
```

```json
// DEither.success(3)
{"@duplojs/lang/kind/@DuplojsLangEither/right":null,
 "@duplojs/lang/kind/@DuplojsLangEither/information":"success",
 "@duplojs/lang/kind/@DuplojsLangEither/value":3,
 "@duplojs/lang/kind/@DuplojsLangEither/success":null}

// DEither.left("fail")
{"@duplojs/lang/kind/@DuplojsLangEither/left":null,
 "@duplojs/lang/kind/@DuplojsLangEither/information":"fail"}
```

## Où travailler

| Besoin | Où |
|---|---|
| Un nouveau statement (`const`, `if`…) | `src/transpiler/transformers/statement/` + `statementTransformers` |
| Une nouvelle expression (ternaire, fonction fléchée, tableau, chaîne, `-x`…) | `src/transpiler/transformers/expression/` + `expressionTransformers` |
| Un nouveau type (union, tableau, tuple…) | `src/transpiler/transformers/type/` + `typeTransformers` |
| Une fonction DuploJS (`DEither.isRight`, `DCommon.print`…) | `src/transpiler/transformers/duplojs/<domaine>/` (+ son `sharedDependency.ts` pour le code Go runtime) |
| Un nœud Go qui n'existerait pas | `src/go/AST/` + `src/go/printer/` (rare : vérifier d'abord [04-arbre-go.md](04-arbre-go.md)) |

À **ne pas** modifier en temps normal : `bin/index.ts`, `build.ts`, `transformSourceFile.ts`.
