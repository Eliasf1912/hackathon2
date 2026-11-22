# 09 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | (10) Lire `dist/` de DuploJS avant de choisir | on sait ce qui tourne vraiment | — | fait : `rightAsyncPipe`, `asyncGroup`, `asyncPipe` sont séquentiels |
| 2 | (10) Synchrone bloquant : `Promise<T>` → `T`, `await x` → `x` | le plus rapide ; déterministe ; même résultat que JS si rien ne s'intercale | ordre des microtâches JS non reproduit | **retenue** (décision utilisateur) |
| 3 | (10) Boucle d'événements émulée en Go | fidèle dans tous les cas | beaucoup de code, une allocation par promesse, appels indirects | rejetée |
| 4 | (10) Goroutines + channels | vrai parallélisme | ordre des effets non déterministe, alors que JS est mono-thread | rejetée |
| 5 | (10) `async*` DuploJS → `rightPipe` / `group` / `pipe` | zéro nouvelle logique : DuploJS est déjà séquentiel | — | **retenue** |
| 6 | (10) `group` appelle les getters dans la boucle | respecte l'arrêt au premier `Left` ; utile aussi à `group` (09) | — | **retenue** |

## Pourquoi ce choix
Le but du projet est la performance. Le modèle synchrone n'ajoute rien à l'exécution : ni promesse allouée, ni synchronisation.
L'émulation paie un coût ; les goroutines cassent l'ordre des effets. Aucune mesure chiffrée ne compare les trois.
DuploJS lui-même n'exploite aucun parallélisme ici : on ne perd rien.
Avec des goroutines, il faudrait en plus annuler les getters après un `Left` (déduction).
Vérifié : Go et TS affichent `["transaction annulée"]` ; `check 3` n'est jamais appelé après le `Left` sur `-5`.

## Encore ouvert
- Refuser (erreur nommée) une promesse pas attendue tout de suite : l'ordre serait alors toujours celui de JS.
- Goroutines pour `asyncGroup` seulement si le transpileur prouve que les calculs sont sans effet.
- `Promise.all`, `Promise.race`, `.then` non traduits ; `Promise` reconnue par son nom seulement.

Sources : `docs/10/conceptions.md`, `docs/bilan/2026-11-19-bilan-conceptions.md`
