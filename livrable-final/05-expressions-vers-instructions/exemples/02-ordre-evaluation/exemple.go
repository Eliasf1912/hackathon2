// Ce qu'il faut regarder : si `p(1)` reste en ligne après le `before` du ternaire,
// `p(2)` passe en premier. La correction range `p(1)` dans une variable d'abord.
package main

import "fmt"

func p(value float64) float64 {
	fmt.Println(value)
	return value
}

func flag() bool {
	return true
}

// Avant la revue 02-10 : ordre JS inversé.
func before() []float64 {
	var second float64 // before du ternaire
	if flag() {
		second = p(2)
	} else {
		second = 0
	}
	return []float64{p(1), second} // p(1) s'exécute après p(2)
}

// Après la revue (shared/sequence.ts) : p(1) est rangé dans une variable.
func after() []float64 {
	first := p(1)
	var second float64
	if flag() {
		second = p(2)
	} else {
		second = 0
	}
	return []float64{first, second}
}

func main() {
	fmt.Println("--- avant la correction (faux : 2 puis 1) ---")
	fmt.Println(before())
	fmt.Println("--- après la correction (comme JS : 1 puis 2) ---")
	fmt.Println(after())
}
