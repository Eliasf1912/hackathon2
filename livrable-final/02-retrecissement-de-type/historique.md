# 02 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | Assertion de type sur l'interface `Either` : `x.(EitherSuccess[float64])` (ex. 01) | suit le type que le checker donne à l'endroit | l'interface est remplacée par `UnionN` en 02 | abandonnée |
| 2 | Lire `x.Vi` selon le type à l'endroit (ex. 02, 03) | marche avec `UnionN` | aucun exercice ne le demandait encore | reportée |
| 3 | `convertToType` : union → membre (`x.Vi`) et union → union (revue 02-10) | brique commune à l'emballage et au rétrécissement | — | **retenue** |
| 4 | A. Déclarer une variable rétrécie au `if` (déduite) | — | reconnaître chaque forme de garde (`isLeft`, `=== undefined`, `return` anticipé…) | non retenue |
| 5 | B. Convertir chez chaque consommateur (déduite) | — | à répéter dans chaque transformer, facile à oublier | non retenue |
| 6 | C. Convertir à chaque lecture d'identifiant (ex. 11) | un seul endroit ; le checker fait l'analyse de flux | double conversion au `return` | **retenue** |
| 7 | Fusionner rétrécissement et conversion : `Union3 → Union3` direct (ex. 11) | plus court | — | ouverte |
| 8 | Extensions (ex. 12) : accès à un champ, `x === undefined` = test de la case 0, n'importer que les paquets écrits | profitent du même mécanisme | — | **retenue** |

## Pourquoi ce choix
Le problème est vu dès 01, mais reporté : aucun programme de 01 à 10 n'en avait besoin. *(Déduction de l'ordre des docs.)*
L'exercice 11 l'impose : `return checkedUsername` après `isLeft`, puis `pipe(checkedUsername, …)` sur la string.
L'option C gagne car le checker fait déjà toute l'analyse de flux. Le transpileur ne reconnaît aucune forme de garde : il lit le résultat.
Un seul endroit à changer, et `return`, `pipe`, appels, `print` reçoivent le bon type sans rien changer.
La case impossible finit en `panic` : Go exige un chemin, et une incohérence plante au lieu de renvoyer une valeur fausse.

## Encore ouvert
- Fusionner rétrécissement et conversion (`docs/11`, question 1) : non implémenté.
- Ré-affectation : l'affectation (12) convertit vers le type déclaré, mais aucun test dédié ne le vérifie.
- Coût des fonctions appelées sur place : non mesuré. *(Déduction : Go les inline peut-être ; non vérifié.)*

Sources : `docs/01`, `docs/02`, `docs/03`, `docs/11`, `docs/12` (`conceptions.md`), `docs/revues/2026-11-19-revue-02-10.md`, `docs/bilan/2026-11-19-bilan-conceptions.md`.
