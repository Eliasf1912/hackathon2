# ASTTranslater : comprendre les arbres du transpiler

Le transpiler lit du TypeScript et écrit du Go. Entre les deux, **il ne manipule jamais de texte** : il convertit un **arbre** (l'AST TypeScript) en un autre **arbre** (l'AST Go), puis imprime ce dernier.

```
texte .ts ──(compilateur TS)──► arbre TS ──(transformers)──► arbre Go ──(GoPrinter)──► texte .go
```

Ce dossier explique ces arbres et l'état actuel du projet.

## Parcours de lecture

| # | Document | Contenu |
|---|---|---|
| 1 | [Notion d'arbre (AST)](01-notion-arbre.md) | Ce qu'est un AST, un nœud, un `kind`, un parent, une feuille |
| 2 | [Familles de nœuds](02-familles-de-noeuds.md) | Statement, expression, déclaration, type : qui peut contenir quoi |
| 3 | [L'arbre TypeScript](03-arbre-typescript.md) | `TsAST`, `SourceFile`, `statements`, les kinds utiles, le type checker |
| 4 | [L'arbre Go](04-arbre-go.md) | `GoAST`, ses familles, les fabriques `createXxx`, le printer |
| 5 | [La conversion](05-conversion.md) | Comment on passe d'un arbre à l'autre : `transformSourceFile`, `context.transform`, les transformers, `before`/`result` |
| 6 | [Le problème actuel](06-probleme-actuel.md) | Objectif des exercices (la conversion complète d'un projet DuploJS en Go est-elle possible ?), arguments et difficultés, puis l'état des transformers : ce qui existe, ce qui manque, exercice par exercice |

## Outil indispensable

**https://ts-ast-viewer.com** : colle du code TypeScript et l'arbre s'affiche, avec le `kind` et les propriétés de chaque nœud. Utilise-le chaque fois qu'une erreur `notfound-transformer` apparaît.
