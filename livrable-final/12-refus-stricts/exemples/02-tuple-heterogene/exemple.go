// Ce qu'il faut regarder : pourquoi refuser [number, string] au lieu de « bricoler ».
// [2]any compilerait, mais réintroduit `any` (interdit). La piste notée dans le code
// (`shortcut:` de type/array.ts) est une struct Tuple2 qui s'écrit en tableau JSON.
// Tuple2 N'EST PAS implémenté : c'est la stratégie prévue, illustrée ici.
package main

import (
	"encoding/json"
	"fmt"
)

// Accepté aujourd'hui : un tuple homogène devient un tableau Go de taille fixe.
var accepted = [2]float64{1, 2}

// Piste future : une struct typée, une case par position, sans `any`.
type Tuple2[T0 any, T1 any] struct {
	V0 T0
	V1 T1
}

// Elle s'écrit en tableau JSON, comme JS : [1,"a"].
func (tuple Tuple2[T0, T1]) MarshalJSON() ([]byte, error) {
	return json.Marshal([2]any{tuple.V0, tuple.V1}) // `any` : sortie JSON seulement
}

func main() {
	encoded, _ := json.Marshal(accepted)
	fmt.Println(string(encoded))

	future := Tuple2[float64, string]{V0: 1, V1: "a"}
	encoded, _ = json.Marshal(future)
	fmt.Println(string(encoded), "| future.V1 est un vrai string :", future.V1+"!")
}
