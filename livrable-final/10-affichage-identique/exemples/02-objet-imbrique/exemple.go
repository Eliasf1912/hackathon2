// Ce qu'il faut regarder : fmt.Println écrit {c1 {Alice} 1e+06} (ni clés, ni quotes) ;
// inspect parcourt la struct avec reflect et lit le nom JS dans le tag json, comme Print.
// Très simplifié : pas de règle des 80 colonnes, pas de [Object] au-delà de 2 niveaux.
package main

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

type Client struct {
	Nom string `json:"nom"`
}

type Commande struct {
	ID     string  `json:"id"`
	Client Client  `json:"client"`
	Total  float64 `json:"total"`
}

// inspect : `any` + reflect, acceptables ici car on ne fait qu'afficher.
func inspect(value any) string {
	v := reflect.ValueOf(value)
	switch v.Kind() {
	case reflect.String:
		return "'" + v.String() + "'"
	case reflect.Float64:
		return strconv.FormatFloat(v.Float(), 'f', -1, 64)
	case reflect.Struct:
		entries := []string{}
		for i := range v.NumField() {
			key := v.Type().Field(i).Tag.Get("json")
			entries = append(entries, key+": "+inspect(v.Field(i).Interface()))
		}
		return "{ " + strings.Join(entries, ", ") + " }"
	}
	return fmt.Sprint(value)
}

func main() {
	commande := Commande{ID: "c1", Client: Client{Nom: "Alice"}, Total: 1000000}
	fmt.Println(commande)
	fmt.Println(inspect(commande))
}
