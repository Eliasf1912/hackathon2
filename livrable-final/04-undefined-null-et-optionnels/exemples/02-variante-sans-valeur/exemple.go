// Ce qu'il faut regarder : `omitzero` sur un `Value float64` efface un vrai 0 (faux).
// Sur un `Value JSUndefined`, la seule valeur possible est undefined : omettre est juste.
// C'est la solution actuelle (commit d581003). Clés JSON simplifiées.
package main

import (
	"encoding/json"
	"fmt"
)

type JSNull struct{}

func (JSNull) MarshalJSON() ([]byte, error) { return []byte("null"), nil }

type JSUndefined struct{} // sa valeur zéro, JSUndefined{}, EST undefined

func (JSUndefined) MarshalJSON() ([]byte, error) { return []byte("null"), nil }

// Left<I, undefined> : solution actuelle. Le champ existe (Print peut afficher
// `value: undefined`), et omitzero l'omet du JSON comme JSON.stringify.
type EitherLeftEmpty struct {
	Left        JSNull      `json:"left"`
	Information string      `json:"information"`
	Value       JSUndefined `json:"value,omitzero"`
}

// Piste écartée en 06 : omitzero sur une vraie valeur T.
type EitherLeftOmitZero[T any] struct {
	Left        JSNull `json:"left"`
	Information string `json:"information"`
	Value       T      `json:"value,omitzero"`
}

func show(label string, value any) { // `any` : affichage de l'exemple seulement
	encoded, _ := json.Marshal(value)
	fmt.Println(label, string(encoded))
}

func main() {
	show("sans valeur (actuel) :", EitherLeftEmpty{Information: "must-be-not-contain-number"})
	// Le défaut de la piste écartée : le 0 disparaît, alors que JS l'aurait gardé.
	show("omitzero sur float64 :", EitherLeftOmitZero[float64]{Information: "negative-operand", Value: 0})
}
