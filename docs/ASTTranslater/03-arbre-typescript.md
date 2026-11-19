# 3. L'arbre TypeScript (`TsAST`)

C'est l'arbre **d'entrée**. Il est produit par le compilateur TypeScript, pas par le projet.

## D'où il vient

| Élément | Origine |
|---|---|
| `TsAST` | `src/typescript/index.ts` : `export * as TsAST from "typescript/ast"` |
| package | `typescript@7.1.0-beta` dans `node_modules` (TypeScript 7, le compilateur réécrit en Go) |
| déclarations | `node_modules/typescript/dist/ast/` (nœuds, `SyntaxKind`, `isXxx`, `factory`) |
| API du compilateur | `node_modules/typescript/dist/api/async/api.d.ts` (classes `Program`, `Checker`…) |

Avec TypeScript 7, le compilateur tourne dans un processus séparé : **toutes les méthodes de l'API sont asynchrones** (`await` obligatoire).

## Comment on l'obtient

1. **`createTypescriptInstance`** (`src/transpiler/createTypescriptInstance.ts`) démarre le compilateur et ouvre le projet décrit par le `tsconfig`. TypeScript lit et analyse alors les fichiers du projet, et prépare le type checker.
2. **`program.getSourceFile(path)`** (dans `build.ts`) **récupère** l'arbre déjà construit d'un fichier.

```ts
const sourceFile = await typescriptInstance.project.program.getSourceFile(path);
```

## La racine : `SourceFile`

`sourceFile` est **la racine de l'arbre** d'un fichier (kind `SourceFile`). Malgré son nom, ce n'est pas un fichier sur le disque, mais un nœud qui contient tout le fichier.

| Propriété | Contenu | Utilisée dans |
|---|---|---|
| `sourceFile.statements` | **tableau** des instructions de haut niveau (les enfants directs) | `transformSourceFile` |
| `sourceFile.path` | chemin du fichier d'origine | `createFileContext`, `build` |
| `sourceFile.imports` | les chaînes des `import` | `resolvedReference.ts` |
| `sourceFile.endOfFileToken` | marqueur de fin (pas dans `statements`) | — |

### `sourceFile.statements`

C'est la liste de ce qui est écrit **directement dans le fichier**, hors de toute accolade :

```ts
import * as DEither from "…";          // statements[0]

export function add(one, two) {        // statements[1]
	return DEither.success(one + two);  //   pas dans statements (dans les { } de la fonction)
}

const x = add(1, 2);                    // statements[2]
```

Analogie : `sourceFile` est **le livre**, `statements` est **la table des matières**, et chaque élément est **un chapitre** qui a son propre contenu (ses enfants).

Un `Block` (`{ … }`) a lui aussi **sa propre** liste `block.statements`.

## Exemple : `projects/00/add.ts`

```
SourceFile
├── ImportDeclaration                       statements[0]   (ignoré par le transpiler)
├── FunctionDeclaration                     statements[1]
│   ├── ExportKeyword                       (modificateur)
│   ├── Identifier "add"                    node.name
│   ├── Parameter                           node.parameters[0]
│   │   ├── Identifier "one"                  .name
│   │   └── NumberKeyword                     .type
│   ├── Parameter                           node.parameters[1]
│   │   ├── Identifier "two"
│   │   └── NumberKeyword
│   └── Block                               node.body
│       └── ReturnStatement                   .statements[0]
│           └── CallExpression                  .expression
│               ├── PropertyAccessExpression      .expression  (DEither.success)
│               │   ├── Identifier "DEither"
│               │   └── Identifier "success"
│               └── BinaryExpression              .arguments[0]
│                   ├── Identifier "one"            .left
│                   ├── PlusToken                   .operatorToken
│                   └── Identifier "two"            .right
└── EndOfFileToken                          (pas dans statements)
```

## Kinds rencontrés dans les exercices

| Kind | Exemple | Propriétés utiles |
|---|---|---|
| `ImportDeclaration` | `import { add } from "./add"` | (ignoré) |
| `FunctionDeclaration` | `function add(a, b) { … }` | `name`, `parameters`, `type`, `body`, `modifiers` (`async`, `export`) |
| `VariableStatement` ⚠️ affiché **`FirstStatement`** | `const x = …` | `declarationList.declarations[i].name` / `.type` / `.initializer` |
| `IfStatement` | `if (c) { … } else { … }` | `expression`, `thenStatement`, `elseStatement` |
| `ReturnStatement` | `return x` | `expression` |
| `ExpressionStatement` | `add(1, 2);` | `expression` |
| `Block` | `{ … }` | `statements` |
| `CallExpression` | `f(a, b)` | `expression`, `arguments`, `typeArguments` |
| `PropertyAccessExpression` | `DEither.success` | `expression`, `name` |
| `Identifier` | `one` | `text` |
| `NumericLiteral` | `12` | `text` |
| `StringLiteral` | `"échec"` | `text` |
| `PrefixUnaryExpression` | `-1` | `operator`, `operand` |
| `BinaryExpression` | `a + b`, `a === b`, `a < b`, `a \|\| b` | `left`, `operatorToken`, `right` |
| `ConditionalExpression` | `a ? b : c` | `condition`, `whenTrue`, `whenFalse` |
| `ArrowFunction` | `(value) => divide(value, 0)` | `parameters`, `body` (expression ou Block) |
| `ArrayLiteralExpression` | `[1, 2, 3]` | `elements` |
| `ObjectLiteralExpression` | `{ success: … }` | `properties` |
| `ArrayBindingPattern` | `([one, two]) => …` | `elements` |
| `AwaitExpression` | `await x` | `expression` |
| `NumberKeyword` (type) | `number` | — |
| `TypeReference` (type) | `DEither.Success<number>` | `typeName`, `typeArguments` |
| `UnionType` (type) | `A \| B` | `types` |
| `ArrayType` / `TupleType` (type) | `T[]` / `[number, number]` | `elementType` / `elements` |

> ⚠️ **`FirstStatement`** : dans l'énumération `SyntaxKind`, `FirstStatement` est un **alias** de `VariableStatement` (même numéro). Le transpiler affiche les kinds avec `TsAST.SyntaxKind[node.kind]` et récupère ce nom-là. Une erreur sur `FirstStatement` concerne donc un `const` / `let`.

## Le type checker : ce n'est pas un arbre

L'arbre ne connaît que la **syntaxe**. Il sait que `add(1, 2)` est un appel, mais pas que le résultat est un `Success<number>`. Pour les **types**, on interroge le type checker :

```ts
context.transpilation.typeChecker
```

Il manipule quatre notions :

| Notion | Exemple | Obtenu avec |
|---|---|---|
| **Node** | le texte `DEither.success(one + two)` dans l'arbre | l'AST |
| **Symbol** | « la chose nommée `success` exportée par `@duplojs/lang/either` » | `getSymbolAtLocation(node)` |
| **Type** | `Success<number>`, `number` | `getTypeAtLocation(node)`, `getTypeOfSymbol(symbol)` |
| **Signature** | la forme d'une fonction : `(value: number) => Success<number>` | `getResolvedSignature(appel)`, `getSignatureFromDeclaration(fonction)` |

Méthodes déjà utilisées dans le projet :

| Méthode | Rôle | Où |
|---|---|---|
| `getResolvedSignature(callExpression)` | signature concrète d'un appel, génériques résolus | `duplojs/either/success/index.ts` |
| `getReturnTypeOfSignature(signature)` | type de retour | idem, `declaration/function.ts` |
| `getSignatureFromDeclaration(fonction)` | signature d'une fonction déclarée | `declaration/function.ts` |
| `typeToTypeNode(type, contexte)` | convertit un **Type** en **nœud** de type (pour le passer aux `typeTransformers`) | idem |
| `getSymbolAtLocation`, `getAliasedSymbol`, `resolveName`, `getMemberInModuleExports` | savoir d'où vient un nom | `resolvedReference.ts` |

Liste complète : classe `Checker` dans `node_modules/typescript/dist/api/async/api.d.ts`.
