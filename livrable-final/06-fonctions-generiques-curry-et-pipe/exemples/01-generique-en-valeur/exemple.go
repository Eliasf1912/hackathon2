// Ce qu'il faut regarder : `coalescing := CoalescingValue[float64]`.
// Go refuse une fonction générique non instanciée ; le transpileur recopie l'instance
// donnée par le checker TS et choisit la surcharge (Value ou Array) à la compilation.
package main

import "fmt"

type EitherFail struct{}

type EitherSuccess[T any] struct{ Value T }

// Union taguée : Tag dit quelle variante est remplie.
type Union2[T0 any, T1 any] struct {
	Tag uint8
	V0  T0
	V1  T1
}

// Deux surcharges TS → deux fonctions Go.
func CoalescingValue[T any](value T) []T   { return []T{value} }
func CoalescingArray[T any](array []T) []T { return array }

type Input = Union2[EitherFail, EitherSuccess[float64]]
type Output = Union2[[]float64, EitherFail] // Fail | readonly [number], lu sur le checker

func add(one float64, two float64) Input {
	if one < 0 || two < 0 {
		return Input{Tag: 0, V0: EitherFail{}}
	}
	return Input{Tag: 1, V1: EitherSuccess[float64]{Value: one + two}}
}

// whenIsRight(input, coalescing) : le transpileur écrit ces if sur place.
func whenIsRightCoalescing(input Input) Output {
	coalescing := CoalescingValue[float64] // l'instance donnée par le checker
	if input.Tag == 0 {
		return Output{Tag: 1, V1: input.V0} // Fail : renvoyé tel quel
	}
	return Output{Tag: 0, V0: coalescing(input.V1.Value)}
}

func main() {
	fmt.Println(whenIsRightCoalescing(add(1, 2)).V0)        // [3]
	fmt.Println(whenIsRightCoalescing(add(-1, 2)).Tag == 1) // true : le Fail
}
