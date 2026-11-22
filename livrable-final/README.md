# TypeScript (DuploJS) vers Go : les problématiques

**La question :** peut-on traduire automatiquement un projet DuploJS en Go, pour qu'il tourne plus vite ?

**Notre réponse :** oui pour tout ce qu'on a rencontré (13 exercices, jusqu'à un programme MVC complet), sans aucun `any` dans la logique du Go produit. Les 13 exercices, 12 variantes et 4 cas ciblés affichent exactement la même chose en TS et en Go (29/29). Les premières mesures vont dans le bon sens, mais ce sont des micro-mesures (voir plus bas).

## L'idée qui rend tout possible

TypeScript a **déjà calculé** tous les types : il sait ce que renvoie une fonction, ce que vaut une variable après un `if`. Le transpileur ne devine rien. Il lit deux choses :

```
code .ts ──► AST (ce qui est écrit) + type checker (ce que TS a compris) ──► AST Go ──► code .go
```

## Les 12 problématiques

Dans chaque dossier : un `README.md` (le problème, l'idée), un `historique.md` (les pistes et pourquoi on a choisi) et 2 exemples TS/Go écrits à la main (`go run exemple.go`).

Le Go des exemples est écrit à la main et montre aussi les approches écartées (« naïf », `fmt.Println` contre façon Node) : sa sortie n'est pas celle du TS.

| # | Problématique | La question | Notre réponse en une ligne |
|---|---|---|---|
| 01 | [Unions et Either](01-unions-et-either/) | « soit un Left, soit un Success » en Go ? | une boîte à cases + une étiquette `Tag` (mesurée : [mesures/](01-unions-et-either/mesures/)) |
| 02 | [Rétrécissement](02-retrecissement-de-type/) | après `if (isLeft(r))`, TS sait ; et Go ? | on lit directement la bonne case |
| 03 | [Objets](03-objets-et-typage-structurel/) | TS compare par la forme, Go par le nom | alias Go : deux noms pour la même forme |
| 04 | [undefined et null](04-undefined-null-et-optionnels/) | Go n'a ni l'un ni l'autre | `undefined` = la case 0, la valeur « rien rempli » |
| 05 | [Expressions](05-expressions-vers-instructions/) | Go n'a pas de ternaire `a ? b : c` | préparer avant (`before`), puis utiliser (`result`) |
| 06 | [Génériques et pipe](06-fonctions-generiques-curry-et-pipe/) | passer une fonction générique en valeur | TS donne le type exact : on écrit `f[float64]` |
| 07 | [Tuples](07-tuples-et-tableaux/) | `[number, number]` en Go ? | tableau fixe `[2]float64` |
| 08 | [Nombres](08-nombres/) | `%`, `-0`, arrondi : Go n'a pas le même sens | `float64` + la fonction Go qui suit JS (`math.Mod`…) |
| 09 | [Asynchronisme](09-asynchronisme/) | `Promise` et `await` en Go ? | on attend tout de suite : modèle synchrone |
| 10 | [Affichage](10-affichage-identique/) | Go doit afficher comme Node | un `Print` qui imite `console.info` |
| 11 | [Vérifier la traduction](11-verifier-la-traduction/) | un Go qui compile fait-il la même chose ? | comparer les sorties TS et Go au caractère près : 29/29 |
| 12 | [Refus stricts](12-refus-stricts/) | que faire de ce qui n'a pas d'équivalent fidèle ? | refuser avec une erreur nommée, jamais traduire faux |

Ordre de lecture conseillé : **01** d'abord (la boîte `UnionN` sert partout), puis 02 et 04. **10** et **11** vont ensemble : sans affichage identique, pas de comparaison possible.

## Les chiffres, et ce qu'ils comparent

| Chiffre | Ce qui est comparé | Où |
|---|---|---|
| **29/29** sorties identiques | 13 exercices + 12 variantes + 4 cas ciblés (`modulo`, `darray`, `negzero`, `multideclaration`), sortie TS contre sortie Go, caractère par caractère | [11](11-verifier-la-traduction/) |
| **13 + 7** sur 20 | stress test : 13 identiques ; 7 non traduits : 5 refus nommés (dont 2 sur une entrée TS invalide) et 2 constructions pas encore prises en charge | [11](11-verifier-la-traduction/) |
| **environ ×13** | Go généré de l'exercice 01, sur une ancienne version (l'interface n'existe plus) : interface (~45 ns, 1 allocation) contre struct (~3,3 ns, 0 allocation) ; programme de mesure non conservé | [01](01-unions-et-either/) |
| **environ ×3** | `Union2` (~3,4 à 4,2 ns, 0 allocation) contre conteneur `any` (~12 à 13,5 ns, 1 allocation) | [01/mesures](01-unions-et-either/mesures/) |
| **8 → 1** allocations | liste de 100 éléments : `append` contre place réservée d'avance (`make`) | [01/mesures](01-unions-et-either/mesures/) |
| **102** noms de refus | erreurs `un-support-…` différentes : `grep -rhoE '"un-support-[a-z0-9-]+"' src \| sort -u \| wc -l` sur `develop` | [12](12-refus-stricts/) |
| **~2,6 ms contre ~200 ms** | un exercice lancé en Go compilé contre en `tsx` ; l'écart vient surtout du démarrage de `tsx` | ordre de grandeur relevé sur le banc |

Les nanosecondes sont des **micro-mesures** : elles comparent deux pistes sur un calcul minuscule, elles ne disent pas de combien un vrai programme va plus vite.

## Ce qu'on retient

- **Faisable** : chaque construction TS rencontrée a trouvé une forme Go typée, ou un refus nommé.
- **Le prix** : un Go plus long, et quelques écarts assumés (ordre des promesses, ordre des clés d'une map).
- **À faire ensuite** : mesurer un programme entier, pas seulement des pistes isolées ; mesurer `UnionN` à 3 et 5 cases.

## Lancer les exemples

Prérequis : Node 22+, `tsx`, `@duplojs/lang`, Go 1.22+.

```bash
go run 01-unions-et-either/exemples/01-interface-ou-union-taguee/exemple.go
npx tsx 01-unions-et-either/exemples/01-interface-ou-union-taguee/exemple.ts
cd 01-unions-et-either/mesures && go test -run x -bench . -benchmem
```

Le journal complet, exercice par exercice, est dans `docs/NN/conceptions.md` du dépôt.
