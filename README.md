# Hackathon DuploJS : transpileur TypeScript (DuploJS) vers Go

## Membres de l'équipe

| | Nom | Prénom | Classe |
|---|---|---|---|
| 1 | DUVERNOIS | Lytween | 5IWJ |
| 2 | GUEPPOIS | Karen | 5IWJ |
| 3 | ZHANG | Changrui | 4IWJ |
| 4 | DUVERNOIS | Elias | 5IWJ |

## Objectif

Le but est de traduire du code TypeScript écrit avec DuploJS en Go, de façon à obtenir un programme plus rapide qui **affiche exactement la même chose** que le programme TypeScript. Les exercices sont dans `projects/01` à `projects/10`. `projects/00` est l'exemple fourni et nous ne l'avons pas modifié. Nous avons ajouté deux exercices bonus, `projects/11` et `projects/12`.

Chaque exercice a sa documentation détaillée (problème, stratégie, résultats, limites) dans `projects/NN/README.md` et `docs/NN/conceptions.md`.

## Stratégies

### Architecture

- Le transpileur lit l'AST TypeScript et produit un AST Go (`src/transpiler`), puis un printer l'écrit en texte Go (`src/go`).
- Chaque genre de nœud a son **transformer**. Les transformers sont rangés par domaine (types, expressions, instructions). Chaque domaine DuploJS (`DArray`, `DString`, `DEither`, `DCommon`, etc.) a **un router**, avec un dossier de handlers par fonction.
- Les fonctions DuploJS sont reconnues **par leur symbole résolu**, c'est-à-dire en vérifiant qu'elles viennent bien de `@duplojs/lang`, et jamais par leur nom. Une fonction utilisateur appelée `map` n'est donc pas confondue avec `DArray.map`.
- Le code du transpileur n'utilise que des fonctions DuploJS (`DArray`, `DString`, etc.), conformément aux règles du dépôt. Les exceptions restantes sont listées dans les limites.
- Le runtime Go n'émet que les fonctions effectivement utilisées par le programme, sans code mort.

### Représentations choisies

| TypeScript | Go | Pourquoi |
|---|---|---|
| `number` | `float64` | Même arithmétique que JS (division, `-0`, `NaN`) |
| Union `A \| B` | Union taguée `Union2[A, B]` / `UnionN` (champ `Tag` + variantes) | Garde le typage, contrairement à `any` qui coûte des allocations et des assertions |
| Objets, `interface`, `type X = {…}` | `struct` | Accès direct aux champs, mémoire compacte |
| Brands DuploJS | Type de base | Le brand n'existe qu'à la compilation TS |
| `DEither` | Valeur avec un champ `Information` typé | `matchInformation` devient un `switch` |
| `async` / `await` | Code synchrone | Les exercices n'ont pas de vraie concurrence |

### Affichage identique à Node

`DCommon.print` en Go reproduit le format de `console.info` de Node (`util.inspect`) : guillemets simples, espaces, retour à la ligne au-delà de 80 caractères, nombres au format JS (`-0`, `1e21`…), `[Array]` et `[Object]` au-delà de 2 niveaux. C'est ce qui permet de comparer les sorties Go et TS caractère par caractère.

### Refus explicites

Quand une construction n'est pas gérée, le transpileur **refuse avec une erreur nommée** (par exemple `un-support-heterogeneous-or-empty-tuple`) au lieu de produire du Go faux. `throw`, `try/catch` et `any` sont refusés volontairement.

## Résultats (vérifiés le 19/11)

| Vérification | Résultat |
|---|---|
| `pnpm test:types` et `pnpm test:lint` | OK |
| Exercices `projects/01` à `projects/12` | Tous transpilés (11 et 12 en bonus) |
| Banc de sorties `.commands/test-outputs.sh` | **29/29 cas identiques** entre Go et TypeScript |
| Tests de résistance `pnpm test:stress` | 13 cas sur 20 acceptés, dont **13/13 avec une sortie Go identique à TS**. Les 7 autres sont des refus attendus (voir les limites) |

## Limites

- **Méthodes natives encore présentes dans le transpileur** : `charAt`, `toUpperCase` et `slice` dans `duplojs/array/collection.ts` et `either/variant/sharedDependency.ts`, `[].includes` dans `duplojs/array/index.ts`, `push` dans `resolvedReference.ts`, `Math.min` dans `shared/functionValue.ts`, et `slice` et `charAt` dans `expression/regularExpression*.ts`.
- **Types reconnus par leur nom** et non par leur symbole : `Promise`, `Record`, `Readonly` et `ReadonlyArray`, ainsi que l'identifiant `undefined`. Une classe utilisateur nommée `Promise` serait confondue avec celle de TypeScript.
- **Affichage** : Node aligne en colonnes les tableaux de plus de 6 éléments, ce que notre `print` ne fait pas. Il y a aussi des écarts possibles sur l'ordre des clés d'un `Record` et sur la largeur des emojis.
- **Déstructuration** : refusée au niveau du fichier. Les motifs imbriqués (`[[a]]`, `{ a: { b } }`), les valeurs par défaut et le reste `[...a]` sont refusés partout.
- **Tuples** : les tuples hétérogènes ou vides (`[number, string]`) et `as const` sont refusés.
- **Refus vus dans `test:stress`** : `any`, `try/catch`, `DEither.fail` à l'intérieur de `DArray` ou de `matchInformation`, et les types fonction dans les méthodes natives de tableau.
- **Domaines DuploJS non traités** : chrono, dataStructure, object, number, invocation, kind, tuple (détail dans `docs/inventaire/2026-11-19-non-traite.md`).

## Reproduction

Prérequis : Node 22, pnpm (la version est fixée dans `package.json`) et Go 1.24 ou plus récent.

```bash
pnpm install

# Vérifications du dépôt
pnpm test:types
pnpm test:lint

# Transpiler un exercice (NN = 00 à 12) ; le Go est écrit dans projects/NN/dist
pnpm build:01
cd projects/01/dist && go run . ; cd -

# Comparer les sorties Go et TypeScript sur tous les cas du banc
./.commands/test-outputs.sh

# Tests de résistance : 20 programmes, sortie Go comparée à la sortie TS
pnpm test:stress
```

**Pourquoi `build:02` à `build:12` ont été ajoutés à `package.json`** : le boilerplate ne fournissait que `build:00` et `build:01`. Nous avons ajouté une commande par exercice, sur le même modèle, pour que chacun puisse être transpilé de la même façon.

**Pourquoi `test:stress` a été ajouté à `package.json`** : ce script exécute 20 programmes TypeScript « pièges » (`test_stress.ts`). Pour chacun, il vérifie que le transpileur accepte le programme ou le refuse avec une erreur nommée, puis il compare la sortie du Go compilé à celle de TypeScript. Il travaille dans un dossier temporaire du système (`os.tmpdir`) et ne laisse aucun fichier dans le dépôt.
