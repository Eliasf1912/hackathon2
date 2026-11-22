// Ce qu'il faut regarder : l'ordre d'affichage. Go calcule tout dès `promise :=`,
// donc il affiche « 1, 2, après » alors que JS affiche « après, 1, 2 ».
// Dans l'exercice 10 rien ne s'intercale entre création et await : sortie identique.
package main

import "fmt"

type EitherSuccess[T any] struct{ Value T }

func step(value float64) EitherSuccess[float64] {
	fmt.Println(value) // DCommon.print(value)
	return EitherSuccess[float64]{Value: value}
}

func main() {
	// const promise = asyncGroup([...]) : en Go, tout est calculé ICI, tout de suite.
	promise := func() EitherSuccess[[2]float64] {
		getters := [2]func() EitherSuccess[float64]{
			func() EitherSuccess[float64] { return step(1) },
			func() EitherSuccess[float64] { return step(2) },
		}
		var values [2]float64
		for index, getter := range getters {
			values[index] = getter().Value // une seule variante : jamais de Left
		}
		return EitherSuccess[[2]float64]{Value: values}
	}()

	fmt.Println("après")
	_ = promise // await promise → promise : la valeur est déjà là
}
