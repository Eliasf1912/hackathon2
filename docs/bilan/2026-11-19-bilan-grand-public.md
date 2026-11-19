# Traduire TypeScript en Go : le bilan expliqué simplement (19/11/2026)

Version pour un public non technique du bilan `2026-11-19-bilan-conceptions.md`.

## De quoi parle-t-on ?

Une entreprise écrit ses programmes en **TypeScript**, avec une boîte à outils maison, **DuploJS**. Le projet pose une question : peut-on **traduire automatiquement** ces programmes en **Go**, un autre langage de programmation, réputé beaucoup plus **rapide** ?

On a donc construit un **traducteur** (on dit « transpileur ») : on lui donne un programme TypeScript, il écrit le programme Go équivalent.

Une image aide à comprendre :

| | TypeScript | Go |
|---|---|---|
| Comme une langue… | souple, qui tolère les sous-entendus | stricte, qui veut que tout soit dit explicitement |
| Ses forces | rapide à écrire, très expressif | rapide à exécuter, très prévisible |
| Le défi | dire **exactement la même chose** dans une langue qui n'a pas les mêmes mots | |

Comme pour une traduction entre deux langues humaines, certaines phrases se traduisent mot à mot. D'autres n'ont **pas d'équivalent** et il faut les reformuler.

## La méthode : douze exercices de difficulté croissante

Plutôt que de tout attaquer d'un coup, on a avancé par **douze exercices**. Chacun ajoute une difficulté nouvelle. Le douzième est un vrai petit logiciel : une **gestion de commandes** (produits, clients, stock, remises).

Pour chaque exercice, la règle est la même :

1. le programme Go doit **fonctionner** ;
2. il doit **afficher exactement la même chose** que le programme d'origine.

C'est vérifié automatiquement : les deux versions sont lancées, et leurs résultats comparés.

Deux règles de conduite tout au long du projet :

- **pas de rustine** : chaque problème est résolu d'une façon qui marchera pour tous les programmes, pas seulement pour l'exercice en cours ;
- **pas de raccourci qui coûte en vitesse** : Go a une « porte de sortie » (le type `any`, qui veut dire « n'importe quoi ») qui simplifierait la traduction mais ralentirait le programme. On ne l'utilise jamais.

## Six exemples de traduction, côte à côte

Les extraits Go ci-dessous sont **réellement produits** par le traducteur. Seuls les noms techniques très longs ont été raccourcis pour la lecture.

### 1. « Ça a marché, ou ça a échoué » (exercice 01)

En TypeScript, une opération peut renvoyer **soit un succès, soit un échec**. La langue le permet naturellement :

```ts
function add(one: number, two: number): Success<number> | Fail {
	return success(one + two);
}
```

Go n'a pas de « soit… soit… ». On l'a reformulé avec une **boîte étiquetée** : une boîte à deux compartiments, plus une étiquette qui dit lequel est rempli (0 = échec, 1 = succès).

```go
func add(one float64, two float64) Union2[Fail, Success[float64]] {
	sum := one + two
	return Union2[Fail, Success[float64]]{
		Tag: 1,            // l'étiquette : « c'est un succès »
		V1:  success(sum), // le compartiment rempli
	}
}
```

Et la question « est-ce un succès ? » devient simplement « que dit l'étiquette ? » :

| TypeScript | Go |
|---|---|
| `if (isRight(result)) { … }` | `if result.Tag == 1 { … }` |

**Le choix et son histoire** : la première idée (une « interface » Go) marchait, mais elle était **13 fois plus lente**. On l'a mesuré, puis abandonné au profit de la boîte étiquetée, sans perte de vitesse.

### 2. Une fiche produit (exercice 12)

En TypeScript, on décrit une fiche produit :

```ts
interface Product {
	readonly id: string;
	readonly name: string;
	readonly price: number;
	readonly stock: number;
}
```

En Go, cela devient une **structure** : une fiche aux cases fixes. Chaque case garde, entre guillemets, son nom d'origine. Ainsi, quand le programme affiche un produit, il écrit exactement les mêmes mots qu'en TypeScript (`"id"`, `"name"`…).

```go
type Product = struct {
	Id    string  "json:\"id\""
	Name  string  "json:\"name\""
	Price float64 "json:\"price\""
	Stock float64 "json:\"stock\""
}
```

La traduction est presque mot à mot. La seule différence visible : Go veut une majuscule au début des noms de cases.

### 3. Retirer du stock : copier la fiche en changeant une case (exercice 12)

```ts
function withdrawStock(product: Product, quantity: number): Product {
	return { ...product, stock: product.stock - quantity };
}
```

Les trois petits points (`...product`) veulent dire en TypeScript « reprends tout le reste de la fiche ». Go n'a pas cette abréviation : le traducteur **recopie chaque case une par une**.

```go
func withdrawStock(product Product, quantity float64) Product {
	return Product{
		Id:    product.Id,
		Name:  product.Name,
		Price: product.Price,
		Stock: product.Stock - quantity,
	}
}
```

C'est plus long, mais c'est le traducteur qui fait ce travail, pas un humain.

### 4. « Si… alors… sinon… » en une seule ligne (exercice 06)

TypeScript permet un choix en une ligne :

```ts
one < 0 ? one : two      // « si one est négatif, one ; sinon two »
```

Go n'a pas cette tournure. Le traducteur la **reformule en phrase complète** :

```go
var chosen float64
if one < 0 {
	chosen = one
} else {
	chosen = two
}
```

Même sens, plus de mots. C'est un cas typique de **reformulation** : ni erreur, ni perte.

### 5. « Peut-être absent » (exercice 12)

Quand on cherche un produit, il peut **ne pas exister**. TypeScript dit alors qu'il est `undefined` (« non défini ») :

```ts
const product = await products.findById(line.productId);

if (product === undefined) {
	return left("product-not-found", line.productId);
}
```

En Go, on réutilise la boîte étiquetée de l'exemple 1. Le compartiment n° 0 est **toujours** réservé à « absent ». La question devient donc encore « que dit l'étiquette ? » :

```go
product := products.FindById(line.ProductId)

if product.Tag == 0 { // 0 = « absent »
	return left("product-not-found", line.ProductId)
}
```

Cette convention unique (« 0 veut dire absent ») a réglé d'un coup une demi-douzaine de situations différentes. C'est l'esprit « pas de rustine » : une règle générale plutôt que des cas particuliers.

### 6. « Attendre une réponse » (exercice 10)

TypeScript sait faire des opérations **asynchrones** : on lance une tâche, et on attend (`await`) sa réponse plus tard.

```ts
async function calculate(one: number, two: number, divisor: number) {
	return rightAsyncPipe(add(one, two), (value) => divide(value, divisor), …);
}

print(await completedCalculations);
```

Trois traductions étaient possibles :

| Option | Avantage | Inconvénient |
|---|---|---|
| **Faire les tâches l'une après l'autre** (retenu) | le plus rapide, résultat toujours identique | dans de rares cas, l'ordre de certains événements peut différer de TypeScript |
| Imiter fidèlement le mécanisme de TypeScript | fidèle dans tous les cas | lourd et lent |
| Faire plusieurs tâches en parallèle | potentiellement très rapide | résultats dans un ordre imprévisible |

Le choix retenu fait simplement **disparaître** l'attente : en Go, `calculate` renvoie directement son résultat.

```go
func calculate(one float64, two float64, divisor float64) Union2[Left[float64], Success[float64]] {
	…
}
```

## Ce que montrent ces douze exercices

### Ce qui marche

- **Tout ce qu'on a rencontré a pu être traduit**, sans jamais utiliser la porte de sortie lente de Go.
- Le **douzième exercice**, un vrai logiciel de gestion de commandes (16 fichiers), donne en Go **exactement les mêmes réponses** qu'en TypeScript. Huit scénarios sont vérifiés : commande réussie, stock insuffisant, client inconnu, remise, etc.
- **44 vérifications automatiques** passent à chaque modification.

### Pourquoi ça marche

Le traducteur ne **devine** jamais. TypeScript a déjà analysé le programme en détail : quelle est la nature de chaque valeur, ce qui peut être absent, ce qui peut échouer. Le traducteur **lit** ces informations et les recopie en Go. C'est comme traduire un texte déjà entièrement annoté par son auteur.

### Le prix à payer

Le Go produit est **plus long** que le TypeScript d'origine (exemples 3 et 4) : là où TypeScript sous-entend, Go explicite. Ce n'est pas gênant, car personne n'a à l'écrire ni à le relire à la main.

### Les petites différences assumées

Quelques cas rares, connus et documentés, où Go ne se comporte pas exactement comme TypeScript :

- l'ordre de certains événements dans les opérations asynchrones (exemple 6) ;
- l'ordre d'affichage des entrées d'un dictionnaire ;
- un emoji compté comme un caractère au lieu de deux dans certaines recherches de texte ;
- certains symboles (`<`, `>`, `&`) affichés sous forme codée.

Quand le traducteur rencontre quelque chose qu'il ne sait pas encore traduire correctement, il **s'arrête avec un message clair** plutôt que de produire un programme faux.

## Ce qui reste à faire

1. **Mesurer la vitesse.** C'est la raison d'être du projet, et elle n'a été mesurée qu'une seule fois, au tout début. Prochaine étape : chronométrer le logiciel de commandes en TypeScript et en Go.
2. **Couvrir le reste de la boîte à outils DuploJS.** Une bonne partie reste à traduire : dates et durées, certaines structures de données, quelques tournures du langage.
3. **Un treizième exercice**, un nouveau programme réaliste qui utilise ce qui manque encore, comme le douzième l'a fait pour les fiches (objets).

## En une phrase

**Traduire automatiquement un vrai programme TypeScript en Go est faisable : douze exercices, dont un vrai logiciel, le prouvent. Il reste à démontrer le gain de vitesse, qui était l'objectif de départ.**
