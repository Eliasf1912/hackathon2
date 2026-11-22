# 06 · Fonctions génériques, curry et `pipe`

**Le problème :** DuploJS passe sans cesse des fonctions comme valeurs ; comment les traduire en Go typé, sans `any` ?

## Pourquoi c'est difficile
TS passe une fonction générique telle quelle (`whenIsRight(r, DArray.coalescing)`) ; Go exige d'abord une instance (`f[float64]`). TS a aussi la forme curryfiée (`DArray.map(fn)` renvoie une fonction) et `pipe(x, f, g)` ; Go n'a ni l'un ni l'autre.

## L'idée
Go veut savoir le type exact avant de passer la fonction. TS l'a déjà calculé : on le lui recopie, `f[float64]`. La forme curryfiée a déjà un type concret : elle devient une closure Go. `pipe` devient des appels imbriqués.
```
TS : pipe(x, whenIsRight(coalescing), map(DString.to))
Go : step1 := func(in Union2[…]) []float64 {…}  // closure ; coalescing = CoalescingValue[float64]
     step2(step1(x))                            // step2 = closure qui appelle Map(in, NumberToString)
```

## Ce qu'on a décidé
- Le checker choisit l'instance et la surcharge (`CoalescingValue` ou `CoalescingArray`) à la compilation.
- Forme curryfiée → closure typée ; `pipe` → `g(f(x))` ; une fonction fléchée ne reçoit que les paramètres qu'elle déclare.

## Limites
- Une closure par forme curryfiée : coût **non mesuré**. `pipe(x, DCommon.print)` (étape générique non instanciée) : Go refuse.

## Exemples
- [exemples/01-generique-en-valeur](exemples/01-generique-en-valeur/) : `coalescing` passée en valeur devient `CoalescingValue[float64]`.
- [exemples/02-forme-curryfiee-et-pipe](exemples/02-forme-curryfiee-et-pipe/) : forme curryfiée → closure ; `pipe` → appels imbriqués.
