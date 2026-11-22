// Ce qu'il faut regarder : `[2]float64` garde la longueur dans le type (décision 08),
// la slice de l'exercice 02 non. Et un tableau Go est copié, pas partagé.
package main

import (
	"fmt"
	"math"
)

type Point = [2]float64 // retenu : boîte à 2 cases

type PointAsSlice = []float64 // piste 02, abandonnée : longueur perdue

func length(point Point) float64 {
	return math.Sqrt(point[0]*point[0] + point[1]*point[1])
}

func main() {
	origin := Point{0, 0}
	path := []Point{{1, 2}, {3, 4}, {5, 6}}
	fmt.Println(origin, path, length(path[1]))

	wrong := PointAsSlice{1, 2, 3}
	fmt.Println("slice : longueur", len(wrong), "acceptée ; avec [2]float64, Go refuse {1, 2, 3}")

	// Limite : sans effet tant que les tuples sont readonly (cas de DuploJS).
	copied := origin
	copied[0] = 99
	fmt.Println("origin après modification de la copie :", origin)
}
