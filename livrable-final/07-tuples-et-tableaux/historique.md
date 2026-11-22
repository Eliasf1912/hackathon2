# 07 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | `readonly T` → `T` (02) | TS vérifie déjà l'immutabilité | — | **retenue** |
| 2 | Tuple → slice `[]T` (02) | aucun type nouveau | longueur perdue ; une allocation par tuple | **remplacée** en 08 |
| 3 | `Map`/`Filter`/`Find`/`Reduce` génériques partagés (05 → 12) | écrits une fois, typés, sans `any` | Go n'est pas générique sur la longueur `N` | **retenue** |
| 4 | Tuple homogène → tableau `[N]T` (08) | longueur dans le type ; pas d'allocation | conversion vers `T[]` à prévoir | **retenue** (utilisateur) |
| 5 | `[N]T` → slice par `x[:]` (08) | pas de copie | marche seulement sur une variable | **retenue** |
| 6 | Paramètre déstructuré → nom généré + `a := p[i]` (08) | Go n'a pas de déstructuration | Go refuse une variable inutilisée → `_ = a` (revue) | **retenue** |
| 7 | Déstructurer un `T[]` (revue 02-10) | — | panique Go ≠ `undefined` JS | **refusée** (erreur nommée) |
| 8 | `group` : `var values [N]T` pour un tuple, `make` sinon (09) | réutilise 08 sans cas particulier | — | **retenue** |
| 9 | `[]` (`never[]`) → slice vide du type attendu (12) | produire dans le type attendu | — | **retenue** |
| 10 | Tuple hétérogène → struct `TupleN[T0…]` + `MarshalJSON` (08, piste) | gérerait `[number, string]` | aucun exercice n'en a eu besoin | **non faite** |

## Pourquoi ce choix
Le but du projet est la performance.
Une slice par tuple coûte une allocation et cache la longueur.
Un tableau `[N]T` est une valeur : pas d'allocation, et la longueur est vérifiée par Go.
Le prix : convertir avec `x[:]` quand une fonction attend `T[]`.
Aucune mesure n'a chiffré ce gain.

## Encore ouvert
- Tuples hétérogènes : toujours refusés (`un-support-heterogeneous-or-empty-tuple`).
- Conversion tuple → `T[]` sur une expression quelconque : refusée (`un-support-type-conversion`).
- Performance de `[N]T` contre `[]T` : non mesurée.

Sources : `docs/02/conceptions.md`, `docs/05/conceptions.md`, `docs/08/conceptions.md`, `docs/09/conceptions.md`, `docs/12/conceptions.md`, `docs/revues/2026-11-19-revue-02-10.md`, `docs/bilan/2026-11-19-bilan-conceptions.md`, `src/transpiler/transformers/type/array.ts`.
