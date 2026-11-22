# 04 · `undefined`, `null` et optionnels

**Le problème :** représenter en Go, sans `any` ni pointeur, une valeur qui peut manquer (`undefined`), valoir `null`, ou être optionnelle (`a?: T`, `f(x, y?)`).

## Pourquoi c'est difficile
JS a deux « absences » : `undefined` et `null`. Go n'a que `nil`, réservé aux pointeurs, maps, slices… Et en Go, une clé absente d'une map donne `0` : on ne distingue plus « vaut 0 » de « absent ».

## L'idée
`undefined` et `null` → deux structs vides, `JSUndefined` et `JSNull`. `T | undefined` → union taguée `Union2[JSUndefined, T]`, `undefined` **toujours en case 0**.
Image : `undefined`, c'est **la case 0 de la boîte, celle qu'on obtient quand on ne remplit rien**.
```go
Union2[JSUndefined, string]{}               // rien rempli = undefined
Union2[JSUndefined, string]{Tag: 1, V1: ""} // "" présent  ≠ undefined
```

## Ce qu'on a décidé
- Tout découle de la case 0 : `x === undefined` → `x.Tag == 0`, `??`, `find`, `table[clé]`, argument manquant. Champ optionnel en `omitzero` : clé absente du JSON, comme JS.
- `DEither.left("x")` sans valeur : variante `EitherLeftEmpty`, champ `Value` de type `JSUndefined` en `omitzero` (commit `d581003`).

## Limites
- `?.` non traité ; types fonction à paramètre optionnel refusés. Chaque `T | undefined` coûte un octet de tag et une copie de `T` (déduction ; non mesuré).

## Exemples
- [exemples/01-undefined-variante-0](exemples/01-undefined-variante-0/) : valeur zéro = `undefined`, `""` présent ≠ `undefined`, `??`.
- [exemples/02-variante-sans-valeur](exemples/02-variante-sans-valeur/) : `omitzero` faux sur un `float64`, juste sur un champ `JSUndefined`.
