# 01 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | Interface Go `Either` + `IsRight()` (ex. 01) | simple, un seul type pour toutes les unions d'Either | ~45 ns et 1 allocation par appel, contre ~3,3 ns et 0 (×13, mesuré sur une ancienne version, programme non conservé) ; ne couvre pas `Fail \| [number]` | abandonnée en 02 |
| 2 | Struct taguée `UnionN[T0…]` (ex. 02) | valeur sans allocation, toute union TS, pas de nom à inventer | taille = somme des cases ; noms longs ; mesuré à 2 cases seulement (voir `mesures/`) | **retenue** |
| 3 | Forme canonique : dédoublonner, trier, `undefined` en case 0 (ex. 02, 12) | une union TS = un seul type Go ; valeur zéro = `undefined` | l'information d'un Left n'est plus dans le type (deux Left de même valeur fusionnent) | **retenue** |
| 4 | Emballer via `convertToType` là où le type cible est connu (ex. 02 → 12) | une seule fonction, appelée partout | — | **retenue** |
| 5 | Union déduite demandée au checker TS (ex. 04) | TS a déjà calculé le type | — | **retenue** |
| 6 | Registre des genres de variantes : `isRight` → test de `Tag` (ex. 02 → 11) | lit le genre sur le type Go seul | registre global : une variante oubliée = un Left | **retenue** |
| 7 | Méthodes génériques Go 1.27 (`WhenV1`) pour `whenIsRight` (ex. 02, 03) | — | la méthode ne sait pas quelle case est un Right ; le type de sortie TS ne colle pas toujours | non retenue |
| 8 | `omitzero` sur `Value T` pour un Left sans valeur (ex. 06) | — | omettrait aussi `0` et `""` | rejetée |
| 9 | `EitherLeftEmpty` sans champ `Value` (ex. 11) | pas de clé `value` en JSON | Node affiche `value: undefined` | remplacée |
| 10 | `Value JSUndefined` + `omitzero` (commit `d581003`) | la seule valeur zéro de `JSUndefined` est `undefined` | — | **retenue** |

## Pourquoi ce choix
Principe de départ : TypeScript a déjà prouvé les types. Le transpileur lit le checker, il ne devine rien.
L'interface a été mesurée : une allocation par appel. Or en DuploJS, toute fonction qui peut échouer renvoie un Either.
L'exercice 02 a ensuite produit `Fail | readonly [number]` : ce n'est plus une union d'Either, l'interface ne suffit plus.
`UnionN` règle les deux : pas d'allocation, et elle vaut pour toute union.
Le registre existe car DuploJS marque ses variantes par des clés symboles, que le checker n'expose pas sous un nom lisible.

## Encore ouvert
- Coût de `UnionN` mesuré à 2 cases (~3,4 à 4,2 ns, 0 allocation, contre ~12 à 13,5 ns pour `any`) ; à 3 et 5 cases : pas encore mesuré.
- `===` sur une union qui contient une slice ne compile pas en Go.
- `matchInformation` curryfié non vérifié par TS : erreur de transpilation en Go, plantage en JS.

Sources : `docs/01/conceptions.md` à `docs/12/conceptions.md`, `docs/bilan/2026-11-19-bilan-conceptions.md`, `docs/revues/2026-11-19-revue-02-10.md`.
