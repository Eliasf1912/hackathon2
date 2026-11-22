# 03 · Objets et typage structurel

**Le problème :** traduire les objets TS en Go, sans `any`, avec le même JSON à l'affichage.

## Pourquoi c'est difficile
TS compare les objets **à la forme** : deux types de mêmes champs sont compatibles. Go compare **au nom** : deux structs nommées sont différentes, même à champs identiques. Et le JSON de JS suit l'ordre d'insertion des clés ; celui de Go, l'ordre des champs de la struct.

## L'idée
Un objet TS → une struct Go **anonyme**. Un type nommé TS → un **alias** Go (`=`) : **deux noms pour la même forme**. Go voit un seul type, comme TS : aucune conversion, aucun coût.
```go
type Product     = struct { Id string `json:"id"` } // interface Product { id: string }
type CatalogItem = struct { Id string `json:"id"` } // même type Go que Product
```

## Ce qu'on a décidé
- Champ en majuscule pour Go, nom TS dans le tag JSON. Optionnel `a?: T` → union avec `undefined` + `omitzero` ([04](../04-undefined-null-et-optionnels/)). `Record` → `map`.
- Objet passé à un autre type : conversion champ par champ. Champ en trop, ordre de clés différent ou champ obligatoire absent : **refuser plutôt que traduire faux**.

## Limites
- Refusés : types récursifs, `extends`, et des programmes TS valides (ordre de clés, champ en trop).
- `map` : Go trie les clés en JSON, JS suit l'ordre d'insertion (non traité). Performance non mesurée.

## Exemples
- [exemples/01-alias-structurel](exemples/01-alias-structurel/) : l'alias accepte un autre nom de même forme ; un type nommé exige une conversion.
- [exemples/02-conversion-struct](exemples/02-conversion-struct/) : conversion champ par champ, et pourquoi l'ordre différent et le champ en trop sont refusés.
