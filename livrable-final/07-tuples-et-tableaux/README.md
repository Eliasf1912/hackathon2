# 07 · Tuples et tableaux

**Le problème :** traduire en Go les tuples TS (`[number, number]`), les tableaux et leur déstructuration, sans perdre la longueur.

## Pourquoi c'est difficile
TS a des tuples à longueur fixe et la déstructuration `([a, b]) => …`. Go n'a ni l'un ni l'autre.
Un tableau Go `[N]T` n'a qu'un type d'élément, et `[N]T` n'est pas `[]T` : il faut convertir (`x[:]`).

## L'idée
Un tuple homogène devient une boîte à N cases, dont N est écrit sur le type : `[N]T`.
C'est une valeur, sans allocation. Un tableau `T[]` reste une slice `[]T`.
Exemple : `([one, two]: [number, number]) => …` → `func(p [2]float64) R { one := p[0]; two := p[1]; … }`.

## Ce qu'on a décidé
- `T[]` → `[]T` ; tuple **homogène** → `[N]T` (08, décision utilisateur).
- Paramètre déstructuré : nom généré, puis une liaison par position (+ `_ = nom` pour Go).
- `Map`, `Filter`, `Find`, `Reduce` écrits une fois en Go ; un `[N]T` leur est passé sans copie par `x[:]`.

## Limites
- Tuple **hétérogène**, vide, optionnel ou rest : refusé. La struct `TupleN` n'est qu'une piste, pas implémentée.
- Déstructurer un `number[]` est refusé (Go paniquerait). Un tuple Go est copié : sans effet tant qu'il est `readonly`.

## Exemples
- [exemples/01-tuple-en-tableau-fixe](exemples/01-tuple-en-tableau-fixe/) : `[2]float64` garde la longueur, la slice non ; la copie Go.
- [exemples/02-destructuration-parametre](exemples/02-destructuration-parametre/) : `([one, two, divisor]) => …` en Go, et la panique sur un `number[]`.
