// Ce qu'il faut regarder : pour chaque ligne, la traduction retenue,
// et à côté la traduction naïve qui compile mais donne un autre résultat.
package main

import (
	"fmt"
	"math"
	"strconv"
)

// Affiche un nombre comme console.info (-0 reste visible).
func show(value float64) string {
	if value == 0 && math.Signbit(value) {
		return "-0"
	}
	return strconv.FormatFloat(value, 'f', -1, 64)
}

var zero float64 = 0

func main() {
	// a % b → math.Mod : `%` ne compile pas sur des float64.
	fmt.Println(show(math.Mod(-7, 3))) // -1

	// -0 littéral → math.Copysign(0, -1), calculé à l'exécution.
	naif := -float64(0) // constante : le compilateur la replie en +0
	fmt.Println(show(math.Copysign(0, -1)), "| naïf :", show(naif)) // -0 | naïf : 0

	// Une variable est calculée à l'exécution : le simple moins suffit.
	fmt.Println(show(-zero)) // -0

	// Math.round(x) → math.Floor(x + 0.5), pas math.Round.
	fmt.Println(show(math.Floor(2.5 + 0.5)))                                    // 3
	fmt.Println(show(math.Floor(-2.5+0.5)), "| naïf :", show(math.Round(-2.5))) // -2 | naïf : -3
}
