// Ce qu'il faut regarder : `toArrayIfRight := func(input Input) Output`.
// La forme curryfiée devient une closure typée par le checker ; `coalescing` est évaluée
// une fois avant elle (comme JS). Et `pipe(x, f, g)` devient simplement `g(f(x))`.
package main

import "fmt"

type EitherFail struct{}

type EitherSuccess[T any] struct{ Value T }

type Union2[T0 any, T1 any] struct {
	Tag uint8
	V0  T0
	V1  T1
}

func CoalescingValue[T any](value T) []T { return []T{value} }

type Input = Union2[EitherFail, EitherSuccess[float64]]
type Output = Union2[[]float64, EitherFail]

func add(one float64, two float64) Input {
	if one < 0 || two < 0 {
		return Input{Tag: 0, V0: EitherFail{}}
	}
	return Input{Tag: 1, V1: EitherSuccess[float64]{Value: one + two}}
}

func double(value float64) float64 { return value * 2 }

func main() {
	// const toArrayIfRight = DEither.whenIsRight(DArray.coalescing)
	coalescing := CoalescingValue[float64] // argument évalué une fois
	toArrayIfRight := func(input Input) Output {
		if input.Tag == 0 {
			return Output{Tag: 1, V1: input.V0}
		}
		return Output{Tag: 0, V0: coalescing(input.V1.Value)}
	}

	fmt.Println(toArrayIfRight(add(1, 2)).V0) // pipe(add(1, 2), toArrayIfRight) → [3]
	fmt.Println(double(double(2)))            // pipe(2, double, double) → 8
}
