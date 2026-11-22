# 10 · Affichage identique

**Le problème :** un exercice est réussi si le Go généré affiche, caractère par caractère, la même chose que le programme TS.

## Pourquoi c'est difficile
`fmt.Println` de Go n'écrit pas les valeurs comme `console.info` de Node.
Le format de Node (`util.inspect`) cache beaucoup de règles : quotes, espaces, 80 colonnes, profondeur.

## L'idée
Go et Node parlent la même langue, mais avec un accent différent (`1e+06` contre `1000000`, `{Alice}` contre `{ name: 'Alice' }`). `Print` apprend à Go l'accent de Node, règle par règle.

| Valeur | Node | `fmt.Println` | `Print` |
|---|---|---|---|
| `1000000` | `1000000` | `1e+06` | `1000000` |
| objet | `{ id: 'c1' }` | `{c1}` | `{ id: 'c1' }` |
| union `A \| B` | la valeur seule | toute la struct | la variante active |

## Ce qu'on a décidé
- Une seule fonction générique `Print[T]`, partagée, qui réimplémente les règles de Node.
- `reflect` et `any` y sont permis, car c'est seulement de l'affichage : la logique métier reste typée.
- Résultat mesuré : de **2/25** à **24/25** sorties identiques au commit `d581003`, puis **29/29** sur le banc final (voir [11](../11-verifier-la-traduction/)).

## Limites
- `Print` n'a aucun cas pour les `map` (`Record`), et l'ordre des clés d'un `map` Go diffère de JS.
- Tableaux de plus de 6 éléments : Node les aligne en colonnes, `Print` non.
- Largeur des emojis et caractères d'Asie de l'Est non prise en compte (règle des 80 colonnes).

## Exemples
- [exemples/01-nombres-et-chaines](exemples/01-nombres-et-chaines/) : nombres et quotes, `fmt.Println` vs `json.Marshal` vs façon Node.
- [exemples/02-objet-imbrique](exemples/02-objet-imbrique/) : un mini `inspect` qui lit les clés dans le tag `json`.
