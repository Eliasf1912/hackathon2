# 03 · Historique des réflexions

| # | Piste | Pour | Contre | Décision |
|---|---|---|---|---|
| 1 | Struct **nommée** par type d'objet (notes de discussion, inventaire) | « le plus rapide » selon l'inventaire ; méthodes possibles | typage nominal : conversion à insérer à chaque passage d'un nom à l'autre, impossible dans `[]T` (déduction) ; nom à inventer pour chaque type anonyme | écartée |
| 2 | Alias Go pour nommer un type long (02, unions) | nomme sans créer de type, sans coût à l'exécution | — | idée reprise en 12 |
| 3 | Struct **anonyme** + **alias** pour les types nommés (12, validée par l'utilisateur) | deux formes égales = même type Go, comme TS ; pas de nom à inventer | pas de méthode sur un objet (le JSON vient des tags) | **retenue** |
| 4 | Champ optionnel = union avec `undefined` en variante 0 + `omitzero` (12) | clé absente du JSON comme en JS | — | retenue |
| 5 | `Record` → `map` (12) | dictionnaire, pas forme fixe | JSON trié par Go | retenue, avec `shortcut` |
| 6 | Littéral produit dans le type attendu, y compris un membre d'union (02, 12) | pas de conversion après coup ; types imbriqués cohérents | — | retenue |
| 7 | Conversion struct → struct qui accepte tout | aucun refus | JSON différent de JS, sans erreur | écartée |
| 8 | Conversion qui refuse champ en trop / ordre / champ manquant (12) | une erreur se voit à la transpilation | rejette des programmes TS valides | **retenue** |

## Pourquoi ce choix
L'inventaire du 19/11 montre que les objets sont le verrou : 615 objets littéraux et 499 types d'objet.
Le typage nominal de Go aurait imposé des conversions partout.
L'alias garde le typage structurel de TS, sans coût.
Sur la vitesse (déduction) : struct anonyme et struct nommée ont la même représentation en mémoire. Non mesuré.
Pour la conversion, une règle : Go doit afficher la même chose que JS. Sinon, on refuse.

## Encore ouvert
- Ordre des clés d'une `map` (piste : map ordonnée partagée avec son `MarshalJSON`).
- Types récursifs, `extends`, et `DModeling` (116 appels) : pas traités.
- Performance des structs, conversions et unions d'objets : non mesurée.

Sources : `docs/notes/notes-discussion.md`, `docs/02/conceptions.md`, `docs/inventaire/2026-11-19-non-traite.md`, `docs/12/conceptions.md`, `docs/bilan/2026-11-19-bilan-conceptions.md`.
