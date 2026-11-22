# 11 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | Un test par pièce du transpileur + un par exercice (01 à 12) | ciblé | dans un dossier local non partagé ; chacun testait ses exercices | remplacée |
| 2 | Comparer les **valeurs** (JSON Go contre objets Node) | avancer sans reproduire l'affichage de Node | cache de vrais écarts : `-0` affiché `0`, `undefined` absent, guillemets | remplacée |
| 3 | Comparer le **texte affiché**, caractère par caractère | c'est ce que demande le sujet ; rien n'est caché | il faut d'abord un `Print` identique à Node (voir 10) | **retenue** |
| 4 | Référence = sortie attendue écrite à la main | rapide | peut être fausse ou périmée | rejetée |
| 5 | Référence = le TS **exécuté** avec `tsx` | toujours juste | plus lent | **retenue** |
| 6 | Seulement les 13 exercices | simple | un exercice ne passe souvent que par un chemin | complétée |
| 7 | + 12 variantes des exercices et 4 cas ciblés (`.commands/output-cases/`) | force les chemins d'erreur et les cas limites | à écrire à la main | **retenue** |
| 8 | Stress test de 20 programmes pièges | cherche les trous, pas ce qu'on sait déjà | — | **retenue** |

## Pourquoi ce choix
Ce qui nous a fait changer : une fusion a cassé tous les projets à plusieurs fichiers sans bruit. **Leçon** : il faut une vérification unique, partagée, qui lance **tous** les programmes.
Au premier passage, presque rien n'était identique (3/26) : sur 25 cas, 22 ne différaient **que par le format d'affichage**. Le banc a donc montré la priorité : reproduire l'affichage de Node.
Ce que la comparaison a trouvé et que la lecture n'aurait pas trouvé :
- `-0` affiché `0` (voir [08](../08-nombres/)) ;
- `const a = 1, b = 2;` : `b` disparaissait sans erreur ;
- l'ordre d'évaluation de `[p(1), f() ? p(2) : 0]` (affichait `2 1` au lieu de `1 2`, voir [05](../05-expressions-vers-instructions/)) ;
- `case a: default:` qui faisait glisser `a` dans le cas suivant (exercice 12).

Tous avaient la même forme : un Go **valide**, qui tourne, et qui ment.

## Encore ouvert
- Mesurer la performance dans le même banc, et pas seulement les sorties.
- Un chemin qu'aucune variante n'exécute n'est pas vérifié.
- Stress test : `typeof` (cas 09) et la déstructuration de tuple dans un `pipe` (cas 16) n'ont pas encore de refus nommé.

Sources : dossier `rendu/04-verifier-la-traduction/` (historique de l'équipe), `.commands/test-outputs.sh`, `.commands/output-cases/`, `test_stress.ts`.
