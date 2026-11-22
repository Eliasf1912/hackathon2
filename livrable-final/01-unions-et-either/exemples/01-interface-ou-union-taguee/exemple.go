// Ce qu'il faut regarder : la même fonction `add` écrite deux fois.
// Piste A (interface, exercice 01) alloue à chaque appel ; piste B (Union2, exercice 02) non.
// Union2 = une boîte à cases V0, V1 + une étiquette Tag qui dit quelle case lire.
package main

import (
	"fmt"
	"testing"
)

type EitherSuccess[T any] struct{ Value T } // variantes simplifiées
type EitherFail struct{}

type Either interface{ IsRight() bool } // piste A

func (EitherSuccess[T]) IsRight() bool { return true }
func (EitherFail) IsRight() bool       { return false }

//go:noinline
func addInterface(one, two float64) Either {
	if one < 0 {
		return EitherFail{}
	}
	return EitherSuccess[float64]{Value: one + two} // copiée sur le tas : 1 allocation
}

// Piste B : union taguée, déclarée une fois par nombre de cases.
type Union2[T0, T1 any] struct {
	Tag uint8
	V0  T0
	V1  T1
}

type AddResult = Union2[EitherFail, EitherSuccess[float64]]

//go:noinline
func addUnion(one, two float64) AddResult {
	if one < 0 {
		return AddResult{Tag: 0}
	}
	return AddResult{Tag: 1, V1: EitherSuccess[float64]{Value: one + two}} // sur la pile
}

func main() {
	if r := addUnion(1, 2); r.Tag == 1 { // isRight(r) : un simple test d'étiquette
		fmt.Println("somme :", r.V1.Value)
	}
	fmt.Println("allocations par appel, interface :", testing.AllocsPerRun(100, func() { _ = addInterface(1, 2) }))
	fmt.Println("allocations par appel, Union2    :", testing.AllocsPerRun(100, func() { _ = addUnion(1, 2) }))
}
