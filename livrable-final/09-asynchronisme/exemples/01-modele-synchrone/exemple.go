// Ce qu'il faut regarder : `calculate` est une fonction Go ordinaire (Promise<T> → T, await x → x),
// et asyncGroup devient une boucle qui appelle chaque getter puis s'arrête au premier Left.
// « jamais affiché » ne s'affiche pas : comme en JS, le 3ᵉ getter n'est pas appelé.
package main

import "fmt"

type EitherLeft struct {
	Information string
	Value       float64
}

type EitherSuccess[T any] struct{ Value T }

type Union2[T0 any, T1 any] struct {
	Tag uint8 // 0 = Left, 1 = Success
	V0  T0
	V1  T1
}

type Result = Union2[EitherLeft, EitherSuccess[float64]]

// async function calculate(...) → func calculate(...) Result ; rightAsyncPipe = rightPipe.
func calculate(value float64, divisor float64) Result {
	if divisor == 0 {
		return Result{Tag: 0, V0: EitherLeft{Information: "division-by-zero", Value: divisor}}
	}
	return Result{Tag: 1, V1: EitherSuccess[float64]{Value: value / divisor * 2}}
}

func main() {
	getters := [3]func() Result{
		func() Result { return calculate(6, 3) },
		func() Result { return calculate(1, 0) },
		func() Result { fmt.Println("jamais affiché"); return calculate(9, 3) },
	}
	var values [3]float64
	for index, getter := range getters {
		item := getter() // appelé dans la boucle, seulement si les précédents ont réussi
		if item.Tag == 0 {
			fmt.Println("oneFails :", item.V0.Information, item.V0.Value) // division-by-zero 0
			return
		}
		values[index] = item.V1.Value
	}
	fmt.Println(values)
}
