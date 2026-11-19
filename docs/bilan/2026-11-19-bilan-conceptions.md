# Bilan des conceptions, exercices 01 à 12 (19/11/2026)

Synthèse de `docs/01` à `docs/12` (`conceptions.md`), de la revue `revues/2026-11-19-revue-02-10.md` et de l'inventaire `inventaire/2026-11-19-non-traite.md`. L'exercice 00 n'a pas de document de conception.

Rappel du but : juger si un projet DuploJS **complet** peut être transpilé en Go, pour la **performance**. D'où deux règles tenues partout : jamais de `any` dans le Go produit, et toujours une solution générale, jamais propre à un exercice.

## 1. Vue d'ensemble

| # | Question posée | Ce qu'il a fallu concevoir |
|---|---|---|
| 01 | Représenter un retour à plusieurs variantes ; traduire un `if` | variables de module (`var` + `init()`), calculs préalables (`before`), union d'Either en interface Go (remplacée en 02) |
| 02 | Passer une fonction générique en valeur (`whenIsRight(r, coalescing)`) | **union taguée générale `UnionN`** ; emballage dans l'union là où le type cible est connu ; le checker choisit l'instance générique |
| 03 | Composer dans un `pipe` ; forme curryfiée | forme curryfiée → closure Go typée par le checker ; `pipe(x, f, g)` → `g(f(x))` |
| 04 | Plusieurs chemins de retour sans annotation | rien de nouveau : le type de retour déduit par TS suffit (preuve que les règles de 01-03 sont générales) |
| 05 | `whenIsRightOtherwise`, `DArray.map`, fonctions fléchées | fonctions anonymes Go ; arguments en trop ignorés comme en JS ; fonctions partagées (`Map[T, R]`) ; `DString.to` choisi à la compilation |
| 06 | Erreurs identifiées (`left("info", v)`), `matchInformation`, ternaire | variantes `Left` / `Right` / `Error` en structs génériques ; **registre des variantes** (leur genre) ; ternaire → variable remplie dans un `if` |
| 07 | Enchaîner des opérations qui échouent (`rightPipe`) | fonction appelée sur place avec `return` anticipés ; outils de répartition par variante partagés (`dispatch.ts`) ; `%` → `math.Mod` |
| 08 | Tableau de tuples, déstructuration d'un paramètre | **décision : tuple → tableau Go `[N]T`** ; liaisons de déstructuration |
| 09 | Regrouper des résultats (`group`) | boucle dans une fonction appelée sur place ; tableau des valeurs dimensionné une fois |
| 10 | Asynchronisme (`rightAsyncPipe`, `asyncGroup`, `await`) | **décision : modèle synchrone bloquant** (`Promise<T>` → `T`) ; getters de `group` ; types fonction |
| 11 | Validation d'un nom (rétrécissement, `isLeft`, regex) | **rétrécissement à la lecture de l'identifiant** ; variantes sans valeur ; fonctions « simples » sous trois formes ; regex compilées une fois, sens JS |
| 12 | Un vrai programme MVC complet (16 fichiers) | **décision : objet → struct anonyme, type nommé → alias** ; `undefined` en variante 0 ; `switch`, `??`, `reduce`, arguments convertis vers les paramètres |

## 2. Les grandes décisions, et comment elles ont évolué

Trois décisions ont été soumises à l'utilisateur (tuples, async, objets) ; les autres ont découlé du code.

| Sujet | Première version | Version actuelle | Pourquoi le changement |
|---|---|---|---|
| **Unions** | 01 : interface Go `Either`, méthode `IsRight()` | 02 : struct générique `UnionN[T0…]{Tag; V0…}` | l'interface coûtait ~×13 et une allocation par appel (mesuré en 01) ; et `Fail \| [number]` n'est pas une union d'Either |
| **`isRight`** | 01 : `x.IsRight()` | 06 puis 11 : test de `Tag` selon le genre connu par le registre ; constante si ce n'est pas une union | les méthodes `IsRight()` sont devenues inutiles et ont été supprimées |
| **Tuples** | 02 : slice `[]T` | 08 : tableau `[N]T` (décision utilisateur) | la longueur est dans le type ; pas d'allocation |
| **Async** | — | 10 : synchrone bloquant (décision utilisateur) | le plus rapide et déterministe ; limite : l'ordre des microtâches JS n'est pas reproduit |
| **Objets** | — | 12 : struct anonyme, type nommé = alias Go (décision utilisateur) | un alias rend deux types de même forme identiques, comme le typage structurel TS |
| **Rétrécissement** | 01-03 : reporté (question ouverte) | 11 : conversion à chaque lecture d'identifiant | tous les consommateurs reçoivent le type attendu sans rien changer chez eux |
| **`undefined`** | 06 : clé `value` absente du JSON (question ouverte) | 11 : variantes sans valeur ; 12 : `undefined` toujours variante 0, valeur zéro = `undefined` | `x === undefined`, `??`, `find`, `MapGet`, argument manquant en découlent tous |

## 3. Les principes qui reviennent dans chaque exercice

Ce sont eux, plus que les fonctions traduites une à une, qui font la généralité du transpileur.

1. **TypeScript a déjà prouvé les types** (01). Le checker est la source de vérité : type d'une expression, signature instanciée d'un générique, type rétréci à un endroit. Le transpileur ne refait aucune inférence.
2. **Une expression produit des calculs préalables** (`before`, 01). Go n'a ni ternaire ni bloc-expression : ce qui doit être calculé avant est rangé dans des instructions, **dans l'ordre d'évaluation JS**. La revue 02-10 a corrigé deux écarts d'ordre (`shared/sequence.ts`).
3. **La fonction appelée sur place** (07, 09, 11, 12) traduit ce que Go ne sait pas exprimer en une expression : `rightPipe`, `group`, conversion d'union vers union, champ d'une union d'objets.
4. **Les fonctions partagées** (`shard_dependencies`, 05 →) : une version générique Go écrite une fois (`Map`, `Filter`, `Find`, `Reduce`, `MapGet`, `UnionN`…), importée seulement si elle sert.
5. **Produire directement dans le type attendu** (02, 12) : un littéral ou une valeur est construit dans le type que le contexte attend, plutôt que converti après coup.
6. **Une seule fonction de conversion**, `convertToType` : membre ↔ union, union → union, struct → struct, objet → membre d'union. Rétrécissement, retours, arguments et champs passent tous par elle.
7. **Refuser plutôt que traduire faux** (01) : des erreurs nommées `un-support-…` (78 comptées par l'inventaire) ; chaque raccourci connu porte un commentaire `shortcut:` avec sa limite.
8. **Go doit afficher la même chose que JS** : chaque exercice est vérifié à l'exécution (test e2e et fixtures `*-runtime`), pas seulement à la compilation.

## 4. Questions ouvertes : où elles en sont

### Réglées

| Question (origine) | Réglée par |
|---|---|
| Coût de l'interface `Either` (01) | `UnionN` (02) |
| Rétrécissement (01, 02, 03) | 11 |
| Tuple en slice (02) | `[N]T` (08) |
| `undefined` dans le JSON d'un `Left` (06) | variantes sans valeur (11) |
| Getters de `group` (09) | 10 |
| Imports en double dans `shard_dependencies.go` (01) | dédoublonnés par chemin (`build.ts`) |
| Noms de types longs (02) | en partie : les types nommés sont des alias Go (12) ; les `UnionN` restent longs |
| Variables inutilisées (01) | en partie : `_ = nom` après les déstructurations et valeurs écrasées (revue, 12) ; une variable affectée jamais lue reste refusée par Go |

### Toujours ouvertes

| Question (origine) | Enjeu |
|---|---|
| **Aucune mesure de performance depuis 01** : `UnionN` à 2, 3 et 5 variantes (01, 02), closures (03, 05), fonctions appelées sur place (07) | c'est le but du projet, et rien n'est mesuré au-delà du benchmark de 01 |
| Ordre d'initialisation des paquets Go (alphabétique) ≠ ordre des `import` TS (01) | aucun exercice n'y est sensible pour l'instant |
| Contraintes DuploJS (`Int`, `NotZero`) → `int64` (01) | gain de performance possible ; débordement à cadrer |
| `json.Marshal` échappe `<`, `>`, `&`, pas `JSON.stringify` (05) | `print` d'une chaîne qui en contient diffère |
| `matchInformation` curryfié non vérifié par TS (06) | erreur de transpilation en Go, plantage en JS |
| `applyWhen` hors de `dispatch.ts` (07) | dette de code |
| Conversion tuple → tableau TS sur une expression quelconque (08) ; tuples copiés en Go (08) | sans effet tant que les tuples restent `readonly` |
| Entrelacement async : refuser une promesse non attendue tout de suite ; goroutines pour les calculs purs (10) | garantir l'ordre JS ; accélérer `asyncGroup` |
| Fusionner rétrécissement et conversion (11) | Go plus court |
| Ré-affectation et rétrécissement (11) | l'affectation (12) convertit vers le type **déclaré** ; aucun test dédié ne le vérifie |
| Clés d'un `map` Go triées dans le JSON (12) ; remontée des fonctions locales (12) | écarts de sens connus |

## 5. Ce que ces douze exercices disent de la faisabilité

**Faisable jusqu'ici, sans `any`.** Chaque construction rencontrée a trouvé une forme Go typée statiquement. 12, un vrai programme en couches, compile et affiche la même chose qu'en TS. Le prix est un Go verbeux (types d'union répétés, fonctions appelées sur place) mais sans conversion dynamique.

**Ce qui a rendu cela possible** : le checker TS. Toute l'information de type dont Go a besoin (instance d'un générique, type rétréci, membre d'union attendu) est déjà calculée par TS. Le transpileur la lit ; il ne la devine jamais.

**Ce qui reste à prouver** :

1. **La performance**, objectif même du projet : elle n'a été mesurée qu'une fois, en 01.
2. **La couverture** : l'inventaire mesurait, avant 12, 4 % de l'API `@duplojs/lang` et 25 % des fonctions DuploJS utilisées par un vrai projet. Depuis 12, les objets, verrou principal, sont en place, mais il manque encore `?.`, les ré-exportations, les générateurs, `DModeling`, `pattern`, et les domaines `chrono` et `dataStructure`.
3. **Les écarts de sens assumés** : ordre des microtâches (10), ordre des clés de `map` (12), emoji dans les regex (11), échappement JSON (05).

## 6. Suite proposée

1. **Mesurer** : un banc de performance Go vs Node sur 12 (et sur `UnionN` à 2, 3, 5 variantes), avant d'optimiser quoi que ce soit.
2. **Recompter l'inventaire** après 12, avec le même outil, pour remplacer les chiffres d'avant.
3. **Poursuivre l'ordre de l'inventaire** : `?.`, ré-exportations, générateurs et boucles, fonctions DuploJS par lot (`modeling`, `pattern`, `cast`, `memo`), puis `new Map` / `Set`.
4. **Un programme 13** qui utilise ce qui manque (générateurs, `DModeling`, ré-exportations), comme 12 l'a fait pour les objets.
