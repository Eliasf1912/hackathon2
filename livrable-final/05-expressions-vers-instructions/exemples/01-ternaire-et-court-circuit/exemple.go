// Ce qu'il faut regarder : le ternaire devient `var` + `if`, et le côté droit de `||`
// est calculé DANS un `if`, jamais avant. La piste `ternary(...)` appelle trop de fois.
package main

import "fmt"

var calls float64

func isNegative(value float64) bool {
	calls += 1
	return value < 0
}

func firstNegative(one float64, two float64) float64 {
	either := isNegative(one) // `isNegative(one) || isNegative(two)`
	if !either {
		either = isNegative(two)
	}
	var result float64 // le ternaire : une variable remplie dans un if
	if either {
		if one < 0 {
			result = one
		} else {
			result = two
		}
	} else {
		result = 0
	}
	return result
}

// Piste rejetée : les deux branches sont évaluées AVANT l'appel.
func ternary[T any](condition bool, ifTrue T, ifFalse T) T {
	if condition {
		return ifTrue
	}
	return ifFalse
}

func main() {
	fmt.Println(firstNegative(-1, 5), calls) // -1 1
	fmt.Println(firstNegative(3, -7), calls) // -7 3
	fmt.Println(firstNegative(3, 4), calls)  // 0 5

	calls = 0
	wrong := ternary(isNegative(-1), 1.0, ternary(isNegative(2), 2.0, 0.0))
	fmt.Println("piste rejetée :", wrong, "appels =", calls, "(JS : 1)")
}
