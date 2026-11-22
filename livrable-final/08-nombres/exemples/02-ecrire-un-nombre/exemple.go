// Ce qu'il faut regarder : Go et JS écrivent les mêmes chiffres,
// seules les règles de FORME changent. NumberToString applique celles de JS.
package main

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// NumberToString reproduit String(x) de JS.
func NumberToString(value float64) string {
	switch {
	case value == 0:
		return "0" // aussi -0 : String(-0) === "0"
	case math.IsNaN(value):
		return "NaN"
	case math.IsInf(value, 1):
		return "Infinity"
	case math.IsInf(value, -1):
		return "-Infinity"
	}
	if absolute := math.Abs(value); absolute >= 1e-6 && absolute < 1e21 {
		return strconv.FormatFloat(value, 'f', -1, 64) // notation décimale
	}
	// Notation exponentielle : Go écrit 1e-07, JS écrit 1e-7.
	return strings.Replace(strconv.FormatFloat(value, 'e', -1, 64), "e-0", "e-", 1)
}

func main() {
	for _, value := range []float64{1e20, 1e21, 1e-7, math.Copysign(0, -1)} {
		fmt.Printf("%s | naïf : %s\n", NumberToString(value), strconv.FormatFloat(value, 'g', -1, 64))
	}
	// 100000000000000000000 | naïf : 1e+20
	// 1e+21 | naïf : 1e+21
	// 1e-7 | naïf : 1e-07
	// 0 | naïf : -0

	// Avec des constantes, Go calculerait 0.1 + 0.2 en précision exacte (0.3).
	// Le Go produit range les opérandes dans des variables float64, comme ici.
	a, b := 0.1, 0.2
	fmt.Println("total=" + NumberToString(a+b)) // total=0.30000000000000004
}
