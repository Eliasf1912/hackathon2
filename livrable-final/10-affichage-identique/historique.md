# 10 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | `Print` = `json.Marshal` (exercices 01 à 12) | quelques lignes ; les tags `json` donnent les vrais noms des clés | NaN refusé ; `<>&` échappés ; `undefined` perdu ; on comparait du JSON, pas le texte affiché | abandonnée pour `print` (gardée pour le JSON) |
| 2 | Banc qui compare au caractère près (commit `aa7975d`) | rend l'écart visible et chiffré | aucun | **retenue** : 2/25 identiques |
| 3 | `Print[T]` qui réimplémente `util.inspect` (commit `d581003`) | sortie identique à Node ; NaN ne bloque plus ; une seule fonction partagée | ~600 lignes de générateur ; `reflect`/`any` dans le Go produit | **retenue** : 24/25 |
| 3b | Méthode `ActiveVariant()` sur chaque `UnionN` | une union s'affiche comme la valeur JS qu'elle contient | une méthode générée de plus | **retenue** |
| 3c | Champ `Value JSUndefined` pour les variantes sans valeur | `value: undefined` affiché comme Node, absent du JSON | exception à la règle `omitzero` | **retenue** |
| 4 | Même comparaison sur le stress test (commit `d0703a9`) | même critère pour les programmes générés en masse | aucun | **retenue** |

## Pourquoi ce choix
Sans mesure au caractère près, « même affichage » n'était pas vérifié : les tests comparaient du JSON.
Le banc a montré l'écart : 2/25.
Réécrire les règles de Node dans `Print` a ramené l'écart à 24/25.
La règle « jamais de `any` » vise la performance de la logique métier.
L'affichage est en bout de chaîne, hors du chemin chaud : `reflect` y est acceptable.
Alternative (déduction) : un `Inspect()` typé par struct, sans `reflect`, mais beaucoup plus de Go généré.

## Encore ouvert
- `map` (`Record`) : `Print` n'a aucun cas pour eux, et l'ordre des clés diffère de JS.
- Tableaux de plus de 6 éléments, largeur des emojis : non reproduits.
- Propriété mise explicitement à `undefined` : (déduction) `Print` la sauterait, Node l'affiche. Non testé.

Sources : `docs/01`, `docs/02`, `docs/05`, `docs/06`, `docs/11`, `docs/12` (`conceptions.md`) ; `docs/bilan/2026-11-19-bilan-conceptions.md` ; commits `aa7975d`, `d581003`, `d0703a9` ; code `src/transpiler/transformers/duplojs/common/print/`.
