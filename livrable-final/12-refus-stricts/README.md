# 12 · Refuser plutôt que traduire faux

**Le problème :** certaines constructions TypeScript n'ont pas d'équivalent Go fidèle. Que faire quand on les rencontre ?

## Pourquoi c'est difficile

Une traduction « à peu près » compile souvent en Go, mais se comporte autrement. C'est le pire bug : le programme tourne et donne un résultat faux, sans aucun message.

## L'idée

Le transpileur est un **traducteur honnête** : quand il ne sait pas traduire une phrase fidèlement, il le dit, avec la phrase et l'endroit, au lieu d'inventer.

```
transformer(nœud) → success        : « voici le Go »
                  → notSupport()   : « pas pour moi, essaie le suivant »
                  → error("un-support-…") : « c'est pour moi, mais je refuse »
aucun transformer ne répond → notfound-transformer (genre du nœud, texte, fichier)
```

## Ce qu'on a décidé

- Chaque refus a un **nom** (`un-support-non-boolean-condition`…) : 102 noms différents sur `develop` (78 avant l'exercice 12), comptés par `grep -rhoE '"un-support-[a-z0-9-]+"' src | sort -u | wc -l`.
- Un raccourci volontaire porte un commentaire `shortcut: <la limite>, <quand l'améliorer>` dans le code (9 aujourd'hui).

## Limites

- Un refus bloque toute la transpilation : il faut réécrire le TS (ex. `if (count > 0)` au lieu de `if (count)`).
- Les écarts que le transpileur ne voit pas (ordre des microtâches, ordre des clés d'une map) ne sont pas refusés : ils sont documentés.

## Exemples

- [exemples/01-truthiness](exemples/01-truthiness/) : pourquoi `if (count)` est refusé, et la traduction naïve qui se trompe sur `NaN`.
- [exemples/02-tuple-heterogene](exemples/02-tuple-heterogene/) : `[number, string]` refusé ; la piste `Tuple2` pour plus tard.
