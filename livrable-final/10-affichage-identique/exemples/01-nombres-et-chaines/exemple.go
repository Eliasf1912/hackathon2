// Ce qu'il faut regarder : pour les mêmes valeurs qu'exemple.ts, fmt.Println a « l'accent Go »
// (1e+06, [l'eau]) et json.Marshal refuse NaN ; jsNumber/jsQuote
// reproduisent l'accent de Node, comme le fait Print (version très simplifiée).
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// jsNumber : écriture d'un nombre façon JavaScript (simplifiée : ni -0 ni Infinity).
func jsNumber(value float64) string {
	if math.IsNaN(value) {
		return "NaN"
	}
	if absolute := math.Abs(value); value != 0 && (absolute >= 1e21 || absolute < 1e-6) {
		return strings.Replace(strconv.FormatFloat(value, 'e', -1, 64), "e-0", "e-", 1)
	}
	return strconv.FormatFloat(value, 'f', -1, 64)
}

// jsQuote : ' par défaut, " si le texte contient déjà '.
func jsQuote(value string) string {
	if strings.Contains(value, "'") {
		return `"` + value + `"`
	}
	return "'" + value + "'"
}

func main() {
	fmt.Println("fmt.Println | json.Marshal | façon Node")
	for _, nombre := range []float64{1000000, 0.0000001, math.NaN()} {
		encoded, err := json.Marshal(nombre)
		if err != nil {
			encoded = []byte("ERREUR")
		}
		fmt.Printf("%v | %s | %s\n", nombre, encoded, jsNumber(nombre))
	}
	for _, chaine := range []string{"bonjour", "l'eau"} {
		encoded, _ := json.Marshal([]string{chaine})
		fmt.Printf("%v | %s | [ %s ]\n", []string{chaine}, encoded, jsQuote(chaine))
	}
}
