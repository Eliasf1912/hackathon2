# Notes de discussion : transpileur TS → Go (cas du projet 01)

> Légende : ✅ **vérifié** (observé en lançant le code) · 🔎 **hypothèse** (raisonnement, à confirmer par un test)

---

## 1. Ce que j'ai appris sur le code

### Le patron de tout transformer

```ts
if (/* ce n'est pas mon genre de nœud */) {
	return context.notSupport();      // "pas pour moi" → on essaie le suivant
}
// … traduire les enfants avec context.transform(enfant, listeDeTransformers)
return context.success({ before, result });
```

- `context.transform(noeud, liste)` essaie les transformers **dans l'ordre** et s'arrête au **premier** qui ne répond pas `notSupport`. La liste définit le **domaine** : types, expressions ou instructions.
- **`before`** : instructions Go à placer **avant** le nœud (variables temporaires). Quand on traduit un enfant, il faut **toujours** faire remonter son `before`, sinon des lignes disparaissent.
- **Either** : une « boîte » qui contient soit un succès (**Right**), soit un échec (**Left** + une information). Les réponses `success`, `notSupport` et `error` sont des Either.
- **Rétrécissement de type (narrowing)** : après `if (!TsAST.isIdentifier(x)) return …`, TypeScript sait que `x` est un `Identifier`, et autorise `x.text`.

### Lire une erreur de build

1. `information` : le **type** d'erreur.
   - `notfound-transformer` : **aucun** transformer n'a reconnu le nœud.
   - `transformation-error` : un transformer l'a **reconnu** mais a **refusé** (par exemple, DEither reconnu, mais seul `success` est géré).
2. `value.text` et `filePath` : le **code TS** qui bloque.
3. `kind` : le **genre de nœud** (attention, `FirstStatement` = `VariableStatement`, c'est un alias de l'enum TS).
4. La pile d'appels : à ignorer, sauf les lignes de notre propre code (`bin/index.ts:79` ne fait que lancer l'erreur).
5. ✅ Le build s'arrête au **premier** nœud non géré, en lisant depuis le fichier d'entrée (`index.ts`). Il faut corriger puis relancer, une erreur à la fois.

### Lire une erreur TypeScript (`pnpm test:types`)

- Commencer par l'erreur **la plus courte**. Une erreur en provoque souvent d'autres **en cascade**.
- Dans une erreur « en escalier », la ligne utile est la **dernière**, la plus profonde.

### Pièges rencontrés

- ✅ `typeTransformers` est un `DCommon.memo(...)` : il faut `.value` pour obtenir la liste.
- ✅ Les propriétés commençant par `_` dans l'autocomplétion (`_statementBrand`) sont **internes** à TS : ne pas les utiliser.
- ✅ `_statementBrand` est de type `any`. `test:types` **passe quand même**, et seul le linter (`no-unsafe-argument`) le détecte. C'est un exemple concret de **`any` qui désactive le typage**.
- ✅ `import type` est obligatoire quand un import ne sert qu'aux types (règle de lint).

---

## 2. Projet 01 : analyse et travail réalisé

### Arbre ✅/❌ (état de départ)

```
index.ts
 ├─ const result = add(1, 2)          ❌ déclaration de variable
 │    └─ add(1, 2)                     ✅ appel (projet 00)
 └─ if (...) { ... }                   ❌ instruction if
      ├─ DEither.isRight(result)       ❌ fonction DuploJS non reconnue
      └─ DCommon.print(result)         ❌ fonction DuploJS non reconnue

add.ts
 └─ type de retour
      └─ ( ... )                       ❌ parenthèses
          └─ A | B                     ❌ union
              ├─ Success<number>       ✅
              └─ Fail                  ❌
```

> Méthode : comparer l'AST d'un exercice avec ceux des exercices réussis. Les **genres de nœuds nouveaux** sont ceux qui n'ont pas de transformer.

### Classement des ❌

| Catégorie | Nœuds | Signification |
|---|---|---|
| **Mécanique** | `const`, `if`, parenthèses | même concept en Go : il suffit d'écrire le transformer |
| **Bibliothèque** | `Fail`, `isRight`, `print` | il faut **recréer** l'outil DuploJS en Go (shared dependency) |
| **Conceptuel** | union `A \| B` | Go n'a pas d'équivalent : il faut **choisir** un contournement |

Le conceptuel **conditionne** le reste : la traduction de `isRight` dépend du choix fait pour l'union.

### Transformers écrits

| Fichier | Rôle | Cas non gérés (→ `notSupport`) |
|---|---|---|
| `type/parenthesized.ts` | `(T)` → traduit `T` (délégation, récursif) | — |
| `statement/variable.ts` | `const x = v` → `x := v` | `const a = 1, b = 2` (seule la 1ʳᵉ déclaration est lue) 🔎 · `let x;` (sans valeur) · `const { a } = obj` / `const [a, b] = l` (déstructuration) |
| `statement/if.ts` | `if (c) { … }` → `if c { … }` | `else` · `if (x) foo();` sans accolades (corps qui n'est pas un `Block`) 🔎 |

✅ Résultat : le build dépasse `const` et `if`, et bloque sur `DEither.isRight(result)` (`transformation-error`).

> 🔎 À examiner : `const a = 1, b = 2` est **accepté** mais `b` est **silencieusement perdu**. Il faudrait sans doute refuser explicitement (`notSupport` si plus d'une déclaration). Sinon, c'est un échec de **niveau 3** (comportement différent, sans erreur).

---

## 3. Problématiques soulevées

### `any` : même mot, sens opposé

- `function.ts` remplace un paramètre sans type par `any`, mais aucun transformer ne gère `AnyKeyword`.
- **TS `any`** désactive les vérifications. **Go `any`** interdit presque tout (`a + b` refusé) tant qu'on n'a pas converti le type.
- Réponses possibles :
  1. refuser avec une erreur claire ;
  2. demander au typeChecker le type réel ;
  3. `any` Go + conversions partout (lourd, fragile, lent).
- Conclusion possible : **un code DuploJS bien typé est plus traduisible**.

### Unions et plusieurs Either

- Le type de retour peut être **écrit** (01) ou **déduit** par TS (07 : `Left<"negative-operand", number> | Success<number>`). Dans les deux cas, on obtient une **union**.
- Les projets 06 à 10 utilisent plusieurs `left` → unions à 3 membres ou plus.

| | A : interface / `any` | B : `(T, error)` |
|---|---|---|
| 1 Success + 1 Fail | ✅ | ✅ |
| 1 Success + plusieurs Left | ✅ chaque variante garde son type | ⚠️ un seul `error` : on perd **lequel** et **sa valeur** |
| Union quelconque (`string \| number`) | ✅ | ❌ |
| Go idiomatique | ❌ | ✅ |

- **Variante intermédiaire : l'interface fermée** (méthode marqueur privée). Elle garde le typage, avec les mêmes performances que `any`.
  - ⚠️ `EitherSuccess` est déclaré comme **alias** (`type X = struct{…}`), et Go interdit les méthodes sur un alias. Il faudrait le transformer en type défini.

### Performance (🔎 tout est à mesurer)

- `any` / interface : une enveloppe (type + pointeur), avec souvent une **allocation sur le tas** et du travail pour le garbage collector. Ordre de grandeur estimé : 10 à 30 ns.
- `(T, error)` : valeurs renvoyées dans les registres, `err == nil` gratuit.
- La différence n'a d'importance que dans des boucles très sollicitées. Un appel réseau coûte des millions de ns.
- **À faire** : un benchmark `go test -bench` (A contre B, temps et allocations), pour remplacer l'hypothèse par un chiffre.

---

## 4. Grille d'analyse : l'échelle des 5 niveaux

Pour chaque construction TS, on essaie les solutions de la meilleure à la pire :

```
1. Équivalent direct          number → float64, if → if
2. Spécialisation             le typeChecker connaît le type exact → code Go précis
3. Représentation générale    interface, struct avec étiquette…
4. Dynamique                  any + vérifications à l'exécution
5. Refus explicite            "construction non traduisible"
```

Plus on descend, plus c'est **général**, mais plus c'est **lent**, moins c'est **sûr** et moins c'est **lisible**.

| Construction TS | Niveau atteignable 🔎 | Traduction Go |
|---|---|---|
| `number`, `if`, `+` | 1 | direct |
| `A \| B` | 2 (cas simple) / 3 | `(T, error)` / interface |
| `string \| undefined` | 2 | pointeur `*string` |
| générique `<T>` | 1 ou 2 | génériques Go / une copie par type |
| `any` | 4 au mieux, ou 5 | `any` + conversions, ou refus |
| objet littéral | 2 | `struct` nommée à générer |
| `throw` / `try` | 3 | `panic`/`recover` ou Either |
| objet modifié dynamiquement, `eval` | 5 | intraduisible |

### Les niveaux dans le code

- Le développeur écrit **toujours le même TS**. C'est le **traducteur** qui choisit le niveau. Seul le niveau 5 contraint le développeur.
- **Mécanisme** : l'**ordre de la liste de transformers** = l'échelle. Le plus spécialisé est placé en premier, le plus général en dernier. Le niveau 5 correspond à `notfound-transformer`.
- Un transformer trop général placé trop tôt **masque** les autres (`any` en premier → tout devient `any`).

### Choisir quand plusieurs options correspondent

| Situation | Règle |
|---|---|
| une option est plus précise | **spécificité** : la plus précise d'abord |
| couverture équivalente | **critère fixé** (perf, lisibilité…) et documenté |
| dépend du cadre d'usage | **configuration** (option de build, commentaire `@go-…`) |
| on veut l'optimal automatiquement | **modèle de coût** (avancé) |

### Difficulté : la cohérence

Un choix fait pour un type **se propage** à tous ses usages. Si `add` renvoie `(T, error)`, alors `isRight(result)` doit devenir `err == nil`. Si c'est une interface, il doit devenir une vérification de type.

→ Recommandation : **un niveau général d'abord** (3 ou 4). Les spécialisations viennent ensuite, comme amélioration.

### Modèle de coût : pourquoi l'écarter

- Version naïve : générer toutes les variantes et comparer → **explosion combinatoire** (3 options × 10 nœuds liés ≈ 59 000 combinaisons).
- Deux coûts distincts :
  - le **coût de traduction**, payé une fois au build ;
  - le **coût d'exécution**, payé à chaque lancement.

  Le vrai frein, c'est surtout la **complexité du traducteur** à maintenir.
- Les vrais compilateurs **estiment sans générer**, **décident localement** (heuristiques) et **optimisent là où ça compte** (PGO dans Go).
- **Go optimise déjà** 🔎 : suppression des variables `Generated_N` inutiles, *escape analysis*, *inlining*.
- **Répartition des rôles** :
  - le traducteur produit du Go **correct et typé**, sans descendre dans l'échelle ;
  - le compilateur Go le rend **rapide**.

  → **Le typage TS devient de la performance Go.**

---

## 5. Piste stratégique : un sous-ensemble traduisible

- La faisabilité n'est pas « oui ou non » : **elle dépend du sous-ensemble de TS qu'on s'autorise**.
- Précédents 🔎 (à vérifier avant de citer) :
  - **AssemblyScript** (TS → WebAssembly) ;
  - **Static TypeScript** de Microsoft (MakeCode) ;
  - **TypeScript 7**, réécrit en Go (version utilisée par ce repo).
- Pour DuploJS : définir un « **DuploJS traduisible** », vérifié par des règles de lint (`@duplojs/code-config`). L'idée : *si ça passe le lint, ça se traduit*. La limite devient un **contrat clair**.

---

## 6. Plan : tester les variations

### Trois façons d'échouer

| Niveau | Ce qui se passe | Gravité |
|---|---|---|
| 1. Refus | `notfound-transformer` / `transformation-error` | 🟢 visible |
| 2. Go invalide | la traduction passe, mais `go build` échoue | 🟠 |
| 3. Comportement différent | tout compile, mais le résultat diffère du TS | 🔴 silencieux |

### Axes de variation autour du cas 01

| Axe | Variantes |
|---|---|
| Nombre de membres | `Success \| Fail` → `Success \| Left<"a"> \| Left<"b">` → 5 membres |
| Contenu des membres | `Success<number>` → `Success<string>` → `Success<{ x: number }>` |
| Union hors Either | `number \| string`, `number \| undefined` |
| Type écrit / déduit | retour explicite (01) / inféré (07) |
| Forme d'utilisation | `isRight` → `isLeft` → `if / else` → résultat passé à une autre fonction |
| Imbrication | union dans une union, Either dans un Either |
| Forme syntaxique | avec ou sans parenthèses, `\|` en tête, alias `type R = …` |

**Démarrage conseillé** : axes « nombre de membres » et « forme d'utilisation » (cœur du débat A/B et de la cohérence).

### Variantes de `add` (projet 00) à prédire, puis tester

| | Variante | Indice |
|---|---|---|
| A | `one - two` | opérateur géré ? |
| B | `one % two` | 🔎 en Go, `%` n'accepte que les entiers, pas les `float64` → niveau 2 ? |
| C | `one + 1.5` | littéral décimal |
| D | `"résultat : " + one` | transformer pour les chaînes ? |
| E | `two = 2` (paramètre par défaut) | — |
| F | fonction fléchée `const add = (…) => …` | même genre de nœud qu'au 00 ? |

### Tableau de suivi (à remplir)

| Variante | Niveau attendu | Résultat observé | Vérifié / hypothèse |
|---|---|---|---|
| | | | |

---

## 7. Questions ouvertes

- Quelle technique l'équipe a-t-elle retenue pour `isRight` ? C'est elle qui dira quelles variantes risquent de casser.
- Faut-il recréer **toutes** les fonctions DuploJS en Go, seulement les plus utilisées, ou les générer automatiquement ?
- Un `if` sans accolades : `[blockStatementTransformer]` renvoie-t-il une erreur propre ? 🔎
- `const a = 1, b = 2` : refuser explicitement plutôt que perdre `b` ?
