# 12 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | Traduire « au mieux » ce qui n'a pas d'équivalent (01) | tous les programmes passent | résultat faux sans message : le pire bug | rejetée |
| 2 | Repli « `any` guidé par TS » pour les cas difficiles (01) | couvre tout | contredit la règle de performance (pas de `any`) | rejetée |
| 3 | Erreur **nommée** `un-support-…` sur le nœud TS fautif (01) | on sait quoi réécrire, et où | bloque la transpilation | **retenue** |
| 4 | `notfound-transformer` automatique quand aucun transformer ne répond | aucun cas oublié ne passe en silence ; donne le genre du nœud, son texte, le fichier | message moins précis qu'une erreur nommée | **retenue** |
| 5 | Commentaire `shortcut:` sur chaque raccourci volontaire | la limite est écrite là où elle agit | à tenir à jour à la main | **retenue** |

## Pourquoi ce choix

Le but du projet est de juger la **faisabilité**. Un Go qui compile mais calcule faux fausserait ce jugement. Un refus nommé, lui, mesure exactement ce qui reste à faire : l'inventaire (`docs/inventaire/`) a pu compter les refus et les classer par priorité.

Le refus est aussi un garde-fou pour la suite : quand un exercice lève une erreur nommée, on sait quelle stratégie générale il manque (ex. les objets, débloqués par l'exercice 12).

## Encore ouvert

- Recompter l'inventaire : 78 erreurs nommées avant 12, 102 sur `develop` (`grep -rhoE '"un-support-[a-z0-9-]+"' src | sort -u | wc -l`).
- Les écarts invisibles au transpileur (microtâches, ordre des clés de map, échappement JSON) restent documentés, pas détectés.

Sources : `docs/01/conceptions.md` (§9 « Des limites explicites plutôt que des contournements », « Limites connues »), `docs/inventaire/2026-11-19-non-traite.md`, `src/transpiler/createTransformer.ts`, `src/transpiler/context/build.ts`.
