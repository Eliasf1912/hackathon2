# 4. L'arbre Go (`GoAST`)

C'est l'arbre **de sortie**. Contrairement à l'arbre TS, il est **défini par le projet**, dans `src/go/`.

| Élément | Dossier |
|---|---|
| Les nœuds Go et leurs fabriques | `src/go/AST/` (importé via `GoAST` depuis `@go`) |
| L'impression en texte Go | `src/go/printer/` (importé via `GoPrinter`) |

Les transformers **construisent** cet arbre. Le printer le **convertit en texte**. On n'écrit jamais de code Go à la main sous forme de chaîne.

## Comment un nœud Go est construit

Chaque nœud est un **objet taggé** DuploJS (voir la doc DuploJS : *concepts > Modélisation > Objets taggés*). Il est créé par une fabrique `GoAST.createXxx` :

```ts
// src/go/AST/statement/if.ts
export interface IfStatement extends DModeling.ObjectTagWithGroup<"if", StatementGroup> {
	initializer?: SimpleStatement;
	condition: Expression;
	body: BlockStatement;
	elseBranch?: BlockStatement | IfStatement;
}

export const createIfStatement = DModeling.createTaggedObjectFactory<IfStatement>("[node][statement]if");
```

Le tag `"[node][statement]if"` indique :
- le **nom** du nœud : `if` ;
- ses **groupes** : `node` et `statement`.

Les groupes permettent de tester la famille d'un nœud. Par exemple, `transformSourceFile` range un résultat au niveau du package s'il appartient au groupe `declaration` :

```ts
DModeling.hasTagGroup(result, "declaration")
```

Le printer, lui, choisit comment afficher chaque nœud grâce à son tag (`src/go/printer/renderNode.ts`).

## Les familles Go

Définies dans `src/go/AST/*/base.ts` :

| Famille (type TS) | Contient |
|---|---|
| `GoAST.Statement` | variables (`var`, `:=`), `const`, types, appels, affectations, `{ }`, `go`, `defer`, `return`, `break`, `continue`, `goto`, `fallthrough`, labels, `if`, `for`, `range`, `switch`, `select` |
| `GoAST.Expression` | identifiants, littéraux, appels, opérateurs, sélecteurs (`a.b`), index, slices, conversions, littéraux composites, fonctions anonymes, instanciations génériques |
| `GoAST.Declaration` | `var`, `const`, `type`, fonctions, méthodes |
| `GoAST.Type` | identifiants de types, tableaux, slices, maps, pointeurs, channels, fonctions, structs, interfaces |
| `GoAST.SimpleStatement` | les statements autorisés en initialisation d'un `if` / `for` : appel, affectation, `:=`… |

Certains nœuds appartiennent à **plusieurs** groupes. Par exemple, `VariableDeclarationInitialized` (`var x = …`) est à la fois une **déclaration** et un **statement** (tag `"[node][declaration][statement]variable-initialized"`).

## Les fabriques disponibles

Elles sont **toutes déjà écrites** et le printer sait les afficher. Avant de créer un nouveau nœud Go, vérifie dans cette liste.

### Expressions

| Fabrique | Go produit |
|---|---|
| `createIdentifier` | `x` |
| `createSelectorExpression` | `pkg.Name`, `a.b` |
| `createCallExpression` | `f(a, b)` |
| `createInstantiationExpression` | `F[T]` (fonction générique instanciée) |
| `createBinaryExpression` | `a + b`, `a == b`, `a && b`… |
| `createUnaryExpression` | `-x`, `!x` |
| `createConversionExpression` | `float64(x)` |
| `createFloatLiteral`, `createIntegerLiteral`, `createStringLiteral`, `createBooleanLiteral`, `createNilLiteral`, `createRuneLiteral` | littéraux |
| `createStructLiteral`, `createSliceLiteral`, `createArrayLiteral`, `createMapLiteral`, `createKeyedElement` | `T{…}`, `[]T{…}`, `map[K]V{…}`, `clé: valeur` |
| `createFunctionLiteral` | `func(…) … { … }` (fonction anonyme) |
| `createIndexExpression`, `createSliceExpression` | `a[i]`, `a[i:j]` |
| `createTypeAssertionExpression` | `x.(T)` |
| `createAddressExpression`, `createDereferenceExpression` | `&x`, `*x` |

### Statements

| Fabrique | Go produit |
|---|---|
| `createShortVariableDeclarationStatement` | `x := …` |
| `createVariableDeclarationInitialized`, `createVariableDeclarationZeroValue` | `var x = …`, `var x T` |
| `createAssignmentStatement`, `createCompoundAssignmentStatement` | `x = …`, `x += …` |
| `createBlockStatement` | `{ … }` |
| `createReturnStatement` | `return …` |
| `createIfStatement` | `if cond { … } else { … }` |
| `createForStatement`, `createRangeStatement` | `for …`, `for k, v := range …` |
| `createExpressionSwitchStatementWith(out)Default`, `createTypeSwitchStatementWith(out)Default`, `createExpressionSwitchCase`, `createTypeSwitchCase`, `createDefaultCase` | `switch` |
| `createBreakStatement`, `createContinueStatement`, `createGotoStatement`, `createFallthroughStatement`, `createLabeledStatement` | sauts |
| `createGoStatement`, `createDeferStatement`, `createSendStatement`, `createSelectStatementWith(out)Default` | concurrence |

### Déclarations, types, fichier

| Fabrique | Go produit |
|---|---|
| `createFunctionDeclaration`, `createMethodDeclaration` | `func …`, `func (r T) …` |
| `createFunctionArgument` | un paramètre |
| `createTypeDefinition`, `createTypeAlias` | `type T struct{…}`, `type T = …` |
| `createConstantDeclaration` | `const …` |
| `createStructType`, `createStructField`, `createStructEmbeddedField` | `struct { … }` |
| `createInterfaceType`, `createInterfaceMethod`, `createTypeUnion` | `interface { … }` |
| `createSliceType`, `createArrayType`, `createMapType`, `createPointerType`, `createChannelType`, `createFunctionType` | `[]T`, `[N]T`, `map[K]V`, `*T`, `chan T`, `func(…)` |
| `createGenericTypeReference`, `createPackageTypeReference`, `createTypeParameter`, `createTypeConstraint` | `T[U]`, `pkg.T`, `[T any]` |
| `GoAST.builtinTypeReferences.float64` (`.string`, `.bool`, `.any`…) | types de base |
| `createGoFile`, `createImportDeclaration` | le fichier complet, `import "…"` |

## Différences importantes avec l'arbre TS

Les deux arbres ne se correspondent **pas** nœud pour nœud. Les transformers doivent combler ces écarts :

| En TypeScript | En Go | Conséquence |
|---|---|---|
| `thenStatement` d'un `if` peut être n'importe quel statement | `IfStatement.body` **doit** être un `BlockStatement` | envelopper la branche dans un bloc si besoin |
| une expression peut contenir des sous-expressions évaluées dans l'ordre | on évalue chaque sous-expression **avant**, dans une variable | le mécanisme `before` / `Generated_N` (voir [05-conversion.md](05-conversion.md)) |
| une fonction générique s'appelle sans préciser `T` | une fonction générique **stockée dans une variable** doit être instanciée : `F[T]` | demander le type au type checker (comme pour `EitherSuccessOf[float64]`) |
| `number` | `float64` | `float64TypeTransformer`, `numericLiteralTransformer` |
| un type peut être une union `A \| B` | pas d'union de valeurs en Go | à concevoir (interface, struct…) : question de l'exercice 01 |
| une valeur JS peut être n'importe quoi au runtime | typage statique strict | chaque valeur doit avoir un type Go connu |
| code de haut niveau d'un module | `func init()` | géré par `transformSourceFile` / `createFile` |
| un nom d'import non utilisé est permis | un import inutilisé est une **erreur** | les imports Go sont déduits de l'usage (`registerDependencyFile`, `registerSharedDependency`) |

## Du nœud au texte : le printer

```ts
GoPrinter.printGoFile(goFile)   // GoAST.GoFile → string
```

Appelé dans `build.ts` pour chaque fichier. Tu n'as normalement pas à le modifier, sauf si tu ajoutes un nouveau type de nœud Go. Il faut alors ajouter son printer dans `src/go/printer/` et l'enregistrer dans `renderNode.ts`.
