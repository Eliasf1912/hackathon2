# 5. La conversion : de l'arbre TS à l'arbre Go

## Le chemin complet

```
bin/index.ts
 └─ DSCommand.exec                 lit et valide --tsconfig / --input / --output (CLI)
     └─ callback
         ├─ DSFile.remove(output)  ⚠️ efface dist/ entièrement
         ├─ createTypescriptInstance      texte .ts → arbres TS + type checker
         └─ build()                       produit les fichiers, un par un
             │  boucle (asyncLoopAccumulator) sur pending = [input, …fichiers découverts]
             ├─ program.getSourceFile(path)        récupère l'arbre TS du fichier
             ├─ transformSourceFile(sourceFile)    ★ arbre TS → arbre Go
             │   └─ pour chaque statement : context.transform(item, sourceFileTransformers.value)
             │       └─ les transformers (récursifs)
             └─ GoPrinter.printGoFile              arbre Go → texte .go
             à la fin : shard_dependencies.go, main.go, go.mod
         └─ asyncReduce : écrit chaque fichier produit dans dist/
```

| Étape | Fonction | Entrée → sortie |
|---|---|---|
| Lire | `getSourceFile` (TypeScript) | chemin → **arbre TS** |
| **Convertir** | **`transformSourceFile` + transformers** | arbre TS → **arbre Go** |
| Imprimer | `GoPrinter.printGoFile` | arbre Go → **texte Go** |

**Seule l'étape « Convertir » est à compléter.**

## `transformSourceFile` (`src/transpiler/transformSourceFile.ts`)

1. **Préparer** : crée le `FileContext` et le `BuildContext` du fichier.
2. **Convertir** : parcourt `sourceFile.statements` avec `asyncReduce`. Pour chaque `item` :
   - si c'est un `import`, il est ignoré ;
   - sinon, `context.transform(item, sourceFileTransformers.value)` est appelé ;
   - le résultat est **rangé** : une déclaration Go va au niveau du package, le reste (avec ses `before`) va dans `init`.
3. **Imports** : les fichiers TS découverts deviennent des `import` Go.
4. **Assembler** : `createFile` produit le `GoFile` (package, imports, déclarations, `func init()`).

`asyncReduce` **parcourt à plat** la liste `statements`. C'est `context.transform` qui **descend** dans chaque statement.

## Un transformer

Créé avec `createTransformer` (`src/transpiler/createTransformer.ts`). Il reçoit `(node, context)` et répond toujours l'un des trois :

| Réponse | Sens |
|---|---|
| `context.notSupport()` | « Ce nœud n'est pas pour moi » : on essaie le transformer suivant |
| `context.success({ result, before })` | « Je l'ai converti » |
| `context.error(node, "message")` | « Il est pour moi, mais je ne sais pas le convertir » : tout s'arrête |

Exemple minimal (`transformers/expression/numericLiteral.ts`) :

```ts
export const numericLiteralTransformer = createTransformer((node, context) => {
	if (!TsAST.isNumericLiteral(node)) {
		return context.notSupport();
	}
	return context.success({
		result: GoAST.createConversionExpression({
			typeReference: GoAST.builtinTypeReferences.float64,
			operand: GoAST.createFloatLiteral({ value: node.text }),
		}),
	});
});
```

## `context.transform(node, liste)` : l'aiguilleur

Il essaie chaque transformer de la liste **dans l'ordre** et s'arrête au premier qui ne répond pas `notSupport`. Si aucun ne prend le nœud, il renvoie **`notfound-transformer`**.

Les transformers l'appellent eux-mêmes pour leurs enfants, ce qui rend la conversion **récursive**.

### Les listes

| Liste | Fichier | Contenu actuel |
|---|---|---|
| `sourceFileTransformers` | `transformers/index.ts` | `declarationTransformers` + `statementTransformers` |
| `declarationTransformers` | `transformers/declaration/index.ts` | duplojs (vide), `functionDeclarationTransformer` |
| `statementTransformers` | `transformers/statement/index.ts` | duplojs (vide), `callExpressionTransformer`, `blockStatementTransformer`, `returnStatementTransformer` |
| `expressionTransformers` | `transformers/expression/index.ts` | `duploJSEitherExpressionTransformer`, `callExpressionTransformer`, `identifierTransformer`, `numericLiteralTransformer`, `binaryExpressionTransformer` |
| `typeTransformers` | `transformers/type/index.ts` | `duploJSEitherTypeTransformer`, `float64TypeTransformer` |

Les listes sont créées avec `DCommon.memo(() => [...])`. On lit le tableau avec `.value`, ce qui évite les problèmes d'imports circulaires entre listes. Les transformers **duplojs** sont toujours en tête pour intercepter `DEither.xxx(…)` avant le transformer d'appel générique.

## `result` et `before`

Go évalue chaque sous-expression dans une variable temporaire, **avant** de l'utiliser. Chaque transformer renvoie :
- `result` : le nœud Go final ;
- `before` : les statements Go à placer **avant** (`Generated_N := …`).

Le **parent** concatène les `before` de ses enfants, dans l'ordre d'évaluation. Exemple, `one + two` :

```
before: [Generated_5 := Sourced_one, Generated_6 := Sourced_two]
result: Generated_5 + Generated_6
```

Les `before` remontent jusqu'à un nœud qui peut les **poser** : un `Block` (qui les aplatit en instructions) ou le fichier (qui les met dans `init`).

## Le `context` (`BuildContext`)

| Méthode / propriété | Rôle |
|---|---|
| `transform(node, liste)` | convertir un nœud enfant |
| `success`, `notSupport`, `error` | les trois réponses |
| `generateIdentifier()` | `Generated_N` (compteur global) |
| `createSourceIdentifier("x")` | `Sourced_x` (préfixe : exporté en Go et sans collision avec les mots réservés) |
| `registerSharedDependency(dep)` | ajoute du code dans `shard_dependencies` + l'import |
| `resolveDependencyFile(node)` / `registerDependencyFile(dep)` | ce nom vient-il d'un autre fichier du projet ? → import + fichier ajouté à `pending` |
| `resolveReferenceModule(node, "@duplojs/lang", /regex/)` | ce nom vient-il d'un package npm (ex. `DEither.success`) ? |
| `transpilation` | **global** : `typeChecker`, `projectWorkDirectory`, `sharedDependencies`, `increment()` |
| `file` | **par fichier** : `sourceFile`, `currentFilePath`, `imports`, `dependencyFiles`, `declarations` |

## Exemple complet : `add.ts`

```
SourceFile                              → transformSourceFile (parcourt statements)
└─ FunctionDeclaration                  → functionDeclarationTransformer
   ├─ Identifier "add"                     → Sourced_add
   ├─ Parameter one: NumberKeyword         → Sourced_one float64   (float64TypeTransformer)
   ├─ Parameter two: NumberKeyword         → Sourced_two float64
   └─ Block                             → blockStatementTransformer
      └─ ReturnStatement                → returnStatementTransformer
         └─ CallExpression              → duploJSEither… → successExpressionHandler → callExpressionTransformer
            ├─ PropertyAccessExpression → duploJSEither… → successExpressionHandler → EitherSuccessOf[float64]
            └─ BinaryExpression         → binaryExpressionTransformer
               ├─ Identifier "one"      → identifierTransformer → Sourced_one
               └─ Identifier "two"      → identifierTransformer → Sourced_two
```

Remontée des résultats :

```go
func Sourced_add(Sourced_one float64, Sourced_two float64) (shard_dependencies.EitherSuccess[float64]) {
	Generated_4 := shard_dependencies.EitherSuccessOf[float64]
	Generated_5 := Sourced_one
	Generated_6 := Sourced_two
	Generated_7 := Generated_5 + Generated_6
	return Generated_4(Generated_7)
}
```

## Organisation de `dist/`

| Fichier | Pourquoi |
|---|---|
| `go.mod` | module `duplojs.local/transpiled` |
| `<chemin>.ts/<nom>.ts.go` | **un fichier TS = un package Go** (= un dossier), pour garder l'isolation des modules TS |
| nom de package `Sourced_…001b…` | chemin absolu encodé (`/` → `001b`, `.` → `001a`) : unique et valide en Go |
| `func init()` | le code de haut niveau d'un module JS s'exécute à l'import, comme `init()` en Go |
| `shard_dependencies/` | le code « runtime » partagé (`JSNull`, `EitherSuccess`…), généré à la fin si au moins une dépendance est enregistrée |
| `main.go` | `import _ "…/index.ts"` déclenche les `init()` en chaîne. `main()` est vide. |
