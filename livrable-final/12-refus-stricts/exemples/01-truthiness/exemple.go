// Ce qu'il faut regarder : Go refuse `if count` (pas un bool). La traduction naïve
// `count != 0` compile, mais se trompe sur NaN : c'est le « bug silencieux » qu'on évite
// en refusant. La règle exacte de JS dépend du type (nombre, chaîne, objet…).
package main

import (
	"fmt"
	"math"
)

// Traduction naïve : compile, mais fausse pour NaN.
func describeNaive(count float64) string {
	if count != 0 {
		return "non nul"
	}
	return "nul ou NaN"
}

// La vraie règle JS pour un nombre : ni 0, ni NaN.
func describeLikeJS(count float64) string {
	if count != 0 && !math.IsNaN(count) {
		return "non nul"
	}
	return "nul ou NaN"
}

// Ce que produit le transpileur une fois le TS réécrit en condition explicite.
func describeExplicit(count float64) string {
	if count > 0 {
		return "positif"
	}
	return "pas positif"
}

func main() {
	for _, count := range []float64{3, 0, math.NaN()} {
		fmt.Printf("%v : naïf=%q, JS=%q\n", count, describeNaive(count), describeLikeJS(count))
	}
	fmt.Println(describeExplicit(3))
}
