# 06 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | (02) Le checker choisit l'instance : `CoalescingValue[float64]` | aucun test de type à l'exécution ; marche pour toute fonction générique | une fonction Go par surcharge | **retenue** |
| 2 | (02) Inférence Go 1.27 : omettre `[float64]` | Go plus court | le choix Value/Array reste au transpileur | notée, non appliquée |
| 3 | (03) Forme curryfiée → closure typée par le checker | devient une valeur ordinaire : marche dans `pipe`, une variable, `map` | une closure créée puis appelée ; coût non mesuré | **retenue** |
| 4 | (03) Méthode générique Go 1.27 (`WhenV1[R]`) | moins de Go généré | ne sait pas quelle variante est le Right ; sortie TS ≠ `Union2[T0, R]` | rejetée |
| 5 | (03) Cœur écrit sur place dans `pipe`, sans closure | pas de closure | cas particulier dans `pipe` | reportée (à mesurer) |
| 6 | (03) `pipe(x, f, g)` → `g(f(x))` | ordre JS respecté, pas de `any` | — | **retenue** |
| 7 | (05) Ne passer que les paramètres déclarés | reproduit JS (arguments en trop ignorés), typé | enveloppe `func(_ T) R` quand Go exige un type précis | **retenue** |
| 8 | (05) `DArray.map` → `Map[T, R]` partagée | écrite une fois, une seule allocation | — | **retenue** |
| 9 | (05) Boucle écrite sur place au lieu de `Map` | « serait plus rapide » | à mesurer | reportée |

## Pourquoi ce choix
Un seul principe : « TypeScript a déjà prouvé les types ». Le transpileur lit le checker, il ne devine pas.
Une sonde montre que la forme curryfiée a déjà un type concret, sans générique : une closure suffit.
La méthode générique (piste 4) échoue : sur son seul type, elle ne sait pas quelle variante est le Right.
Un `Pipe` générique à N étapes demanderait une fonction par arité ou `any` (déduction) ; les appels imbriqués évitent les deux.

## Encore ouvert
- Performance des closures : rien n'est mesuré depuis l'exercice 01.
- `pipe(x, DCommon.print)` : ne pas ranger les références simples (`pkg.F`) dans une variable.
- `map` avec index/`self` : erreur nommée en 05 ; reprise après les objets (12) non vérifiée.

Sources : `docs/02/conceptions.md`, `docs/03/conceptions.md`, `docs/05/conceptions.md`, `docs/bilan/2026-11-19-bilan-conceptions.md`
