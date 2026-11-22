# 08 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | `number` → `int` / `int64` (00) | rapide | `1 / 2` vaut `0` en Go, `0.5` en JS : faux dès la première division | rejetée |
| 2 | Choisir selon la valeur (`1` → `int`, `1.5` → `float64`) | rapide quand ça marche | un même `number` reçoit les deux : conversions partout | rejetée |
| 3 | `number` → `float64` (00) | même norme que JS : division, `NaN`, `Infinity`, `-0` | plus lent qu'un entier pour un compteur | **retenue** |
| 4 | `%` → `math.Mod` (07, banc `modulo`) | même signe que JS (celui du dividende) | — | **retenue** |
| 5 | `-0` → `-float64(0)` | simple | constante repliée en `+0` par le compilateur | remplacée |
| 6 | `-0` littéral → `math.Copysign(0, -1)` | calculé à l'exécution : garde le signe | — | **retenue** |
| 7 | `Math.round` → `math.Round` (12) | même nom | arrondit les demis loin de zéro : `-2.5` → `-3` | rejetée |
| 8 | `Math.round(x)` → `math.Floor(x + 0.5)` (12) | demis vers +∞, comme JS | — | **retenue** |
| 9 | Nombre → texte avec `strconv.FormatFloat(x, 'g', -1, 64)` | une ligne | `1e+20`, `1e-07`, `-0` : pas la forme JS | remplacée |
| 10 | `NumberToString` : mêmes chiffres, règles de forme de JS | vérifié contre Node sur 17 valeurs | — | **retenue** |
| 11 | Opérateurs sur les bits : conversion en entier 32 bits | fidèle | aucun exercice ne le demandait | refus nommé `un-support-bitwise-operator` |

## Pourquoi ce choix
`float64` est le seul choix **juste par construction**. La vitesse se gagne ailleurs : pas de `any`, pas d'allocation (voir [01](../01-unions-et-either/)).
La vraie difficulté n'était pas le type, mais **chaque opérateur**. `%`, `-0`, l'arrondi et l'écriture ont chacun demandé une correction.
Toutes ont été trouvées en **exécutant** les deux programmes et en comparant les sorties (voir [11](../11-verifier-la-traduction/)), pas en lisant le code.
Leçon de `-0` : « même type » ne suffit pas, il faut aussi « même **moment** de calcul » (compilation ou exécution).

## Encore ouvert
- Entiers `int64` pour les nombres contraints (`DNumber.Int`) : demande un cadrage du débordement.
- Cas mixtes de `+` (`"x" + true`, `number | string`) : refusés (`un-support-concatenation-type`).

Sources : dossier `rendu/03-nombres/` (historique de l'équipe), banc `.commands/output-cases/` (variantes `modulo`, `negzero`), `src/transpiler/transformers/expression/binary.ts` et `unary.ts`.
