// Ce qu'il faut regarder : OptionalString{} (rien rempli) vaut undefined, car
// undefined est la variante 0. Un "" présent a Tag 1 : il reste distinct de undefined.
// `x === undefined` devient `x.Tag == 0`, et `??` devient un simple if.
package main

import (
	"encoding/json"
	"fmt"
)

type JSUndefined struct{}

func (JSUndefined) MarshalJSON() ([]byte, error) { return []byte("null"), nil }

type JSNull struct{}

func (JSNull) MarshalJSON() ([]byte, error) { return []byte("null"), nil }

type Union2[T0 any, T1 any] struct {
	Tag uint8
	V0  T0
	V1  T1
}

type OptionalString = Union2[JSUndefined, string] // string | undefined

func label(code OptionalString) string {
	if code.Tag == 0 { // code === undefined
		return "aucun code"
	}
	return "code " + code.V1
}

func codeOrDefault(code OptionalString) string {
	if code.Tag == 0 { // code ?? "SANS-CODE" : la droite n'est calculée que si besoin
		return "SANS-CODE"
	}
	return code.V1
}

func main() {
	fmt.Println(label(OptionalString{})) // valeur zéro = undefined
	fmt.Println(label(OptionalString{Tag: 1, V1: "VIP"}))
	fmt.Println(label(OptionalString{Tag: 1, V1: ""})) // "" présent
	fmt.Println(codeOrDefault(OptionalString{}))

	encoded, _ := json.Marshal([2]any{JSNull{}, JSUndefined{}}) // `any` : affichage de l'exemple seulement
	fmt.Println(string(encoded))
}
