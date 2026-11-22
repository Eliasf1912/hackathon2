// Ce qu'il faut regarder : le paramètre reçoit un nom (ici `triple`), puis une liaison
// par position. Sur un `number[]` trop court, Go panique : d'où le refus.
package main

import "fmt"

// Fonction partagée, écrite une fois (exercice 05).
func Map[T any, R any](array []T, theFunction func(T) R) []R {
	result := make([]R, len(array))
	for index, element := range array {
		result[index] = theFunction(element)
	}
	return result
}

func main() {
	inputs := [][3]float64{{1, 2, 1}, {4, 5, 3}, {2, 3, 2}}

	// ([one, two, divisor]) => (one + two) / divisor
	results := Map(inputs, func(triple [3]float64) float64 {
		one := triple[0]
		two := triple[1]
		divisor := triple[2]
		_, _, _ = one, two, divisor // Go refuse une variable inutilisée (revue 02-10)
		return (one + two) / divisor
	})

	// ([, second]) => second
	seconds := Map(inputs, func(triple [3]float64) float64 {
		second := triple[1]
		return second
	})
	fmt.Println(results, seconds)

	// JS donnerait `undefined`, Go panique.
	defer func() { fmt.Println("number[] trop court → Go :", recover()) }()
	short := []float64{1}
	_ = short[1]
}
