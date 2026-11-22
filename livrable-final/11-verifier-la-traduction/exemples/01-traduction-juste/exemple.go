// Ce qu'il faut regarder : Math.round devient math.Floor(x + 0.5). Traduction juste, retravaillée à la main.
package main

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

type EitherLeft[T any] struct {
	Information string
	Value       T
}
type EitherSuccess[T any] struct{ Value T }
type Union2[T0 any, T1 any] struct {
	Tag uint8
	V0  T0
	V1  T1
}
type DivideResult = Union2[EitherLeft[float64], EitherSuccess[float64]]

func Map[T any, R any](array []T, theFunction func(T) R) []R {
	result := make([]R, len(array))
	for index, element := range array {
		result[index] = theFunction(element)
	}
	return result
}

// Affichage réduit à ce dont ce programme a besoin (voir le dossier 10).
func printNumbers(values []float64) {
	texts := make([]string, len(values))
	for index, value := range values {
		texts[index] = strconv.FormatFloat(value, 'f', -1, 64)
	}
	fmt.Println("[ " + strings.Join(texts, ", ") + " ]")
}

func divide(value float64, divisor float64) DivideResult {
	if divisor == 0 {
		return DivideResult{Tag: 0, V0: EitherLeft[float64]{"division-by-zero", value}}
	}
	return DivideResult{Tag: 1, V1: EitherSuccess[float64]{value / divisor}}
}

var prices []float64

func init() {
	prices = []float64{2.5, -2.5, 0.5}
}

func main() {
	// Math.round → math.Floor(x + 0.5) : les demis vont vers +∞, comme JS.
	printNumbers(Map(prices, func(price float64) float64 { return math.Floor(price + 0.5) }))
	fmt.Println(divide(7, 0).Tag == 0)
	fmt.Println(divide(7, 2).Tag == 0)
}
