# 09 · Asynchronisme

**Le problème :** `async`, `Promise` et `await` n'existent pas en Go ; comment traduire un flux asynchrone DuploJS sans changer l'ordre ni le résultat ?

## Pourquoi c'est difficile
TS a `Promise`, `await` et une boucle d'événements mono-thread : les microtâches passent dans un ordre fixe. Go n'a ni promesse ni `await` ; ses goroutines sont parallèles et l'ordonnanceur décide de l'ordre.

## L'idée
Au lieu d'attendre une promesse plus tard, Go attend tout de suite : chaque `await` devient un simple appel. Ça suffit, car `rightAsyncPipe`, `asyncGroup` et `asyncPipe` sont déjà séquentiels dans DuploJS (lu dans `dist/`).
```
Promise<T> → T        async function f(): Promise<T> → func f() T        await x → x
rightAsyncPipe / asyncGroup / asyncPipe → rightPipe / group / pipe (déjà traduits)
```

## Ce qu'on a décidé
- Modèle synchrone bloquant (décision utilisateur) : rien ajouté à l'exécution, déterministe. Exercice 10 : Go et TS affichent `["transaction annulée"]`.
- `group` appelle chaque getter dans la boucle : arrêt au premier `Left`, comme `asyncGroup`.

## Limites
- L'ordre des microtâches JS n'est pas reproduit si un effet s'intercale entre la promesse et son `await`.
- Aucun parallélisme. `Promise.all`, `Promise.race`, `.then` : non traduits.

## Exemples
- [exemples/01-modele-synchrone](exemples/01-modele-synchrone/) : `async` → fonction ordinaire, `asyncGroup` → boucle qui s'arrête au premier `Left`.
- [exemples/02-limite-ordre-microtaches](exemples/02-limite-ordre-microtaches/) : la limite, JS affiche `après, 1, 2` et Go `1, 2, après`.
