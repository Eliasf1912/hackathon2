# 1. Notion d'arbre (AST)

## Qu'est-ce qu'un AST ?

Un **AST** (*Abstract Syntax Tree*, arbre de syntaxe abstraite) représente du code sous forme d'**arbre**. Chaque morceau du code devient une case de l'arbre, appelée **nœud** (*node*).

Exemple, la ligne :

```ts
return DEither.success(one + two);
```

devient :

```
ReturnStatement
└── CallExpression                    DEither.success(one + two)
    ├── PropertyAccessExpression      DEither.success          (la fonction appelée)
    │   ├── Identifier "DEither"
    │   └── Identifier "success"
    └── BinaryExpression              one + two                (l'argument)
        ├── Identifier "one"
        ├── PlusToken                 +
        └── Identifier "two"
```

## Vocabulaire

| Terme | Sens | Dans l'exemple |
|---|---|---|
| **Nœud** (*node*) | une case de l'arbre | chaque ligne du schéma |
| **`kind`** | le type de syntaxe du nœud | `ReturnStatement`, `CallExpression`… |
| **Racine** | le nœud tout en haut | `ReturnStatement` (pour un fichier entier, c'est `SourceFile`) |
| **Enfants** | les nœuds juste en dessous | `PropertyAccessExpression` et `BinaryExpression` sont les enfants de `CallExpression` |
| **`parent`** | le nœud juste au-dessus | le parent de `BinaryExpression` est `CallExpression` |
| **Feuille** | un nœud sans enfant | `Identifier`, `PlusToken`, `NumericLiteral` |
| **Sous-arbre** | un nœud avec tout ce qu'il contient | `BinaryExpression` et ses 3 enfants |

Chaque nœud a des **propriétés nommées** selon son kind. Par exemple, une `CallExpression` a :
- `node.expression` : la fonction appelée ;
- `node.arguments` : la liste des arguments.

Et chaque nœud connaît son parent : `node.parent`.

## Pourquoi un arbre et pas des lignes ?

Une ligne n'a **aucun sens** pour un compilateur :

```ts
// UNE instruction sur PLUSIEURS lignes
export function add(
	one: number,
	two: number,
) { … }

// PLUSIEURS instructions sur UNE ligne
const a = 1; const b = 2; add(a, b);
```

L'arbre découpe le code selon sa **structure** (déclaration, appel, addition…), quelle que soit la mise en page. Le transpiler ne lit donc jamais le code ligne par ligne : il parcourt l'arbre.

## Les arbres présents dans le projet

| Arbre | Rôle | Doc |
|---|---|---|
| **Arbre TypeScript** (`TsAST`) | l'**entrée** : le code TS lu, fourni par le compilateur TypeScript | [03-arbre-typescript.md](03-arbre-typescript.md) |
| **Arbre Go** (`GoAST`) | la **sortie** : le code Go à produire, construit par les transformers | [04-arbre-go.md](04-arbre-go.md) |

Le **type checker** de TypeScript n'est **pas** un arbre. C'est un service qu'on interroge pour connaître les types (`Success<number>`…). Il est décrit dans [03-arbre-typescript.md](03-arbre-typescript.md#le-type-checker--ce-nest-pas-un-arbre).

## Tester les kinds dans le code

Le module `TsAST` fournit une fonction `isXxx` par kind :

```ts
if (TsAST.isCallExpression(node)) {
	node.expression;   // TypeScript sait maintenant que node est une CallExpression
	node.arguments;
}
```

Ce sont des *type guards* : après le `if`, le type de `node` est affiné.
