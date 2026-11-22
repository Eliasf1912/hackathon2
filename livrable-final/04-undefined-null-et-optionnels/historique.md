# 04 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | `*T`, `nil` = absent (notes de discussion) | simple, idiomatique Go | (déduction) confond `null` et `undefined` ; allocation ; ne compose pas avec `A \| B \| undefined` | jamais appliquée |
| 2 | Union taguée générale `UnionN` (02) | sert à toute union TS ; `A \| B` = `B \| A` | — | retenue, outil de base |
| 3 | `JSNull` / `JSUndefined`, structs vides + `MarshalJSON` (06) | `null` et `undefined` distincts et typés ; JSON `null` | — | retenue |
| 4 | `omitzero` sur un champ `Value T` d'Either (06) | omet la clé comme JS | omettrait aussi un vrai `0` ou `""` | écartée |
| 5 | Refuser `Left` sans valeur (06) | pas de traduction fausse | bloque `DEither.left("x")` | provisoire, remplacée |
| 6 | Variantes `…Empty` **sans** champ `Value` (11) | l'absence est décidée par le type | Node affiche `value: undefined`, impossible sans champ | remplacée par 6 bis |
| 6 bis | Variantes `…Empty` avec `Value JSUndefined` + `omitzero` (commit `d581003`) | clé omise du JSON comme JS, `value: undefined` affichée comme Node | — | **retenue** |
| 7 | `T \| undefined` = `Union2[JSUndefined, T]`, `undefined` en variante 0 (12) | valeur zéro Go = `undefined` : tests, `??`, `find`, `MapGet`, argument manquant | un tag en plus | **retenue** |
| 8 | `omitzero` sur tout champ qui peut valoir `undefined` (12) | ici la valeur zéro est `undefined` seulement | — | retenue |

## Pourquoi ce choix
Le cœur du sujet : la valeur zéro de Go.
Sur un `float64`, la valeur zéro est `0`, une vraie valeur : `omitzero` y est faux (piste 4).
Sur `Union2[JSUndefined, float64]`, la valeur zéro est `{Tag: 0}` = `undefined` ; un `0` présent vaut `{Tag: 1, V1: 0}`.
Sur `JSUndefined`, la seule valeur possible est `undefined`, qui est aussi sa valeur zéro.
Donc `omitzero` omet la clé exactement quand JS l'omet (pistes 6 bis et 8).

## Encore ouvert
- `?.` : non traité (piste de l'inventaire : test sur `JSNull` / `JSUndefined`, comme le court-circuit de `&&`).
- Ré-affectation puis rétrécissement (`x = undefined` puis `x = 3`) : aucun test dédié (déduction).
- Performance : non mesurée.

Sources : `docs/notes/notes-discussion.md`, `docs/02/conceptions.md`, `docs/06/conceptions.md`, `docs/11/conceptions.md`, `docs/12/conceptions.md`, `docs/bilan/2026-11-19-bilan-conceptions.md`, `docs/inventaire/2026-11-19-non-traite.md`.
