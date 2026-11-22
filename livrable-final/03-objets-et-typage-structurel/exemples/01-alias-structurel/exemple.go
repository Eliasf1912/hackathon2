// Ce qu'il faut regarder : avec `=` (alias), Product et CatalogItem sont deux noms
// pour la même forme, donc describe(item) passe tel quel. Sans `=` (type nommé),
// Go exige une conversion explicite ProductNominal(…).
package main

import (
	"encoding/json"
	"fmt"
)

// interface Product { id: string; price: number }
type Product = struct {
	Id    string  `json:"id"` // majuscule pour Go, nom TS exact dans le tag
	Price float64 `json:"price"`
}

// type CatalogItem = { id: string; price: number }
type CatalogItem = struct {
	Id    string  `json:"id"`
	Price float64 `json:"price"`
}

func describe(product Product) string { return fmt.Sprintf("%s : %v €", product.Id, product.Price) }

// Piste écartée : types nommés (typage nominal).
type ProductNominal struct {
	Id    string  `json:"id"`
	Price float64 `json:"price"`
}

type CatalogItemNominal struct {
	Id    string  `json:"id"`
	Price float64 `json:"price"`
}

func describeNominal(product ProductNominal) string { return "nominal : " + product.Id }

func main() {
	item := CatalogItem{Id: "keyboard", Price: 49.9}
	fmt.Println(describe(item)) // alias : aucune conversion

	encoded, _ := json.Marshal(item)
	fmt.Println(string(encoded)) // mêmes clés qu'en JS grâce aux tags

	itemNominal := CatalogItemNominal{Id: "mouse", Price: 19.9}
	fmt.Println(describeNominal(ProductNominal(itemNominal))) // conversion obligatoire
}
