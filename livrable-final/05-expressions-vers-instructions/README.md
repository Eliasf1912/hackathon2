# 05 · Des expressions TS vers des instructions Go

**Le problème :** en TS, beaucoup de calculs tiennent en une expression ; en Go, il faut parfois des instructions.

## Pourquoi c'est difficile
TS a le ternaire, `??` et `rightPipe` qui s'arrête au premier échec. Go n'a ni ternaire ni `??` ; s'arrêter demande un `return`, parcourir un `for`.
Il faut aussi garder l'ordre JS (gauche à droite) et le court-circuit de `||` / `&&`.

## L'idée
TS calcule une valeur en une ligne. Go doit d'abord préparer les ingrédients (`before`), puis servir le plat (`result`).
Chaque transformer renvoie donc une paire `{ before, result }`.
Exemple : `f(c ? a : b)` → before = `var t T; if c { t = a } else { t = b }`, result = `f(t)`.

## Ce qu'on a décidé
- Ce qui n'est calculé que sous condition va **dans** une branche Go, jamais avant (01).
- Un élément suivi d'un élément qui a des `before` est d'abord rangé dans une variable (revue 02-10).
- Besoin d'un `return` ou d'une boucle dans une expression : fonction appelée sur place `func() T { … }()` (07, 09).

## Limites
- Go verbeux (variables temporaires) ; coût des fonctions appelées sur place non mesuré.
- Un `if` sur une valeur non booléenne est refusé (`un-support-non-boolean-condition`).

## Exemples
- [exemples/01-ternaire-et-court-circuit](exemples/01-ternaire-et-court-circuit/) : ternaire et `||` → variable + `if` ; la piste `ternary(...)` casse le court-circuit.
- [exemples/02-ordre-evaluation](exemples/02-ordre-evaluation/) : le bug d'ordre trouvé en revue, avant et après correction.
