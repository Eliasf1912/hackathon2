# 2. Familles de nœuds : qui peut contenir quoi

Les nœuds se rangent en quelques **familles**. Comprendre ces familles, c'est comprendre **où chaque nœud peut apparaître** et **ce qu'il peut contenir**. Les dossiers de `src/transpiler/transformers/` suivent exactement ces familles.

## Statement et expression

| | **Expression** | **Statement** (instruction) |
|---|---|---|
| Ce que c'est | quelque chose qui **vaut** une valeur | quelque chose qui **fait** une action |
| Question | « Combien ça vaut ? » | « Qu'est-ce que ça fait ? » |
| Exemples | `1`, `one + two`, `add(1, 2)`, `one`, `"abc"`, `a ? 1 : 2` | `return …`, `if (…) {…}`, `const x = …`, `{ … }` |

### Le test du `=`

```ts
const x = 1;               // ✅ expression
const x = one + two;       // ✅ expression
const x = add(1, 2);       // ✅ expression
const x = return 3;        // ❌ → return est un statement
const x = if (a) { … };    // ❌ → if est un statement
```

> **Si ça peut être à droite d'un `=`, c'est une expression. Sinon, c'est un statement.**

## Les familles

| Famille | Exemples de kinds | Dossier de transformers | Liste |
|---|---|---|---|
| **Statement** | `ReturnStatement`, `IfStatement`, `Block`, `VariableStatement`, `ExpressionStatement` | `statement/` | `statementTransformers` |
| **Déclaration** (statement particulier qui **nomme** quelque chose) | `FunctionDeclaration` (plus tard : interface, type…) | `declaration/` | `declarationTransformers` |
| **Expression** | `CallExpression`, `BinaryExpression`, `Identifier`, `NumericLiteral`, `PropertyAccessExpression` | `expression/`, `common/` | `expressionTransformers` |
| **Type** | `NumberKeyword` (`number`), `TypeReference` (`Success<number>`), `UnionType` (`A \| B`) | `type/` | `typeTransformers` |
| **Feuilles / jetons** | `Identifier`, `PlusToken`, `ExportKeyword`, `EndOfFileToken` | (traités par leur parent) | — |

## Règles de contenance

```
SourceFile            contient une LISTE de statements      (sourceFile.statements)
Block { … }           contient une LISTE de statements      (block.statements)
Statement             contient des expressions et/ou des statements (souvent un Block)
Expression            contient d'autres expressions
Type                  contient d'autres types
```

> **On descend toujours dans ce sens : statements → expressions → … → feuilles.**
> Une expression ne contient (presque) jamais de statement. La seule exception est une fonction écrite comme valeur (`() => { … }`) : la fonction est une expression, mais son corps `{ … }` contient des statements.

### Détail par kind

| Nœud | Contient (propriétés TS) |
|---|---|
| `SourceFile` | `statements` : des **statements** |
| `Block` `{ }` | `statements` : des **statements** |
| `ReturnStatement` | `expression` : **une expression** (facultative) |
| `IfStatement` | `expression` : la condition (**expression**) ; `thenStatement` : un **statement** (souvent un Block) ; `elseStatement` : un **statement** ou `undefined` |
| `ExpressionStatement` | `expression` : **une expression** utilisée seule (`add(1, 2);`) |
| `VariableStatement` | `declarationList.declarations[]`, et chaque déclaration a un `name` et un `initializer` (**expression**) |
| `FunctionDeclaration` | `name`, `parameters[]` (chacun avec un `type`), `type` (retour, facultatif), `body` : **un Block** |
| `CallExpression` | `expression` : la fonction (**expression**) ; `arguments` : des **expressions** |
| `BinaryExpression` | `left`, `right` : des **expressions** ; `operatorToken` : le jeton (`+`, `===`…) |
| `PropertyAccessExpression` | `expression` (à gauche du point) ; `name` (à droite) |
| `Identifier`, `NumericLiteral`, `StringLiteral` | rien : ce sont des **feuilles** (`node.text` donne le texte) |

## Les pièges classiques

### `ExpressionStatement` : une expression seule sur sa ligne

Un Block ou un fichier ne peut contenir **que des statements**. Une expression utilisée seule est donc **enveloppée** :

```ts
add(1, 2);
```

```
ExpressionStatement        [statement]
└── CallExpression         [expression]
```

C'est pour ça que `callExpressionTransformer` commence par « ouvrir » l'enveloppe :

```ts
const node = TsAST.isExpressionStatement(rawNode) ? rawNode.expression : rawNode;
```

### `{ }` : bloc ou objet ?

```ts
{ const a = 1; }        // Block                   → statement (contient des instructions)
const o = { a: 1 };     // ObjectLiteralExpression → expression (contient des propriétés)
```

### `if` ou ternaire ?

```ts
if (a) { … } else { … }  // IfStatement            → statement : choisit du CODE
const x = a ? 1 : 2;     // ConditionalExpression  → expression : choisit une VALEUR
```

### `else if` n'existe pas en tant que tel

C'est un `if` **rangé dans le `else`** du premier :

```
IfStatement (a)
├── thenStatement: Block
└── elseStatement: IfStatement (b)
    ├── thenStatement: Block
    └── elseStatement: Block
```

### Un statement contient une expression, mais reste un statement

```ts
const result = add(1, 2);
//             └───────┘  expression : la valeur
└───────────────────────┘ statement : déclarer result

return add(1, 2);
//     └───────┘  expression : la valeur
└───────────────┘ statement : sortir de la fonction
```

## Exemple complet : `projects/01/index.ts`

```ts
const result = add(1, 2);

if (DEither.isRight(result)) {
	DCommon.print(result);
}
```

```
SourceFile
├── VariableStatement                         [statement]  const result = …
│   └── VariableDeclarationList
│       └── VariableDeclaration
│           ├── Identifier "result"           (le nom)
│           └── CallExpression                [expression] add(1, 2)
│               ├── Identifier "add"
│               ├── NumericLiteral 1
│               └── NumericLiteral 2
│
└── IfStatement                               [statement]
    ├── CallExpression                        [expression] DEither.isRight(result)
    │   ├── PropertyAccessExpression          [expression] DEither.isRight
    │   └── Identifier "result"
    └── Block                                 [statement]
        └── ExpressionStatement               [statement]  DCommon.print(result);
            └── CallExpression                [expression]
                ├── PropertyAccessExpression  DCommon.print
                └── Identifier "result"
```

## Conséquence pour les transformers

Chaque transformer **sait quelle famille il contient** et appelle donc la bonne liste pour ses enfants :

```ts
// returnStatementTransformer : ce qui suit return est une expression
context.transform(node.expression, expressionTransformers.value)

// blockStatementTransformer : chaque élément d'un bloc est un statement
context.transform(statement, statementTransformers.value)

// functionDeclarationTransformer : le type d'un paramètre est un type
context.transform(parameter.type, typeTransformers.value)
```
