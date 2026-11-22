# 02 · Rétrécissement de type

**Le problème :** après `if (isLeft(x)) return x;`, TS sait que `x` est une `string`, mais en Go `x` reste une `Union3[…]`.

## Pourquoi c'est difficile
En TS, le type d'une variable dépend de l'endroit : `Left | Error | string` avant le `if`, `Left | Error` dedans, `string` après.
En Go, une variable a un seul type, celui de sa déclaration. Et Go exige d'écrire même la case que TS a exclue.

## L'idée
TS sait déjà quelle case de la boîte est remplie ici : Go lit directement cette case. À chaque lecture d'une variable, le transpileur compare son type Go déclaré au type que TS donne à cet endroit ; s'ils diffèrent, il appelle `convertToType` (la même fonction que pour l'emballage).
```
if (isLeft(x)) { return x; }  // TS : Left | Error   Go : x reste Union3 -> func(…){…}(x), panic pour la string
return length(x);             // TS : string         Go : x.V2
```

## Ce qu'on a décidé
- Convertir à la **lecture de l'identifiant** (`identifier.ts`, `narrow`) : `return`, `pipe`, appels, `print` reçoivent le bon type sans changer.

## Limites
- Double conversion : `return x` rétrécit (`Union3 → Union2`) puis élargit (`Union2 → Union3`). Une seule suffirait.
- Non vérifié : ré-affectation (aucun test dédié). Non mesuré : coût des fonctions appelées sur place.

## Exemples
- [exemples/01-union-vers-membre](exemples/01-union-vers-membre/) : `valeur` lue comme `valeur.V0` dans le `if`, comme `valeur.V1` après.
- [exemples/02-union-vers-union-plus-etroite](exemples/02-union-vers-union-plus-etroite/) : le cas de l'exercice 11, `Union3 → Union2 → Union3` avec `panic`.
