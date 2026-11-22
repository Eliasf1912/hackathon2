// Ce qu'il faut regarder : un objet d'un autre type est converti champ par champ
// vers Command (string → string | undefined). Puis deux cas que TS accepte mais que
// le transpileur refuse, car le JSON Go serait différent de celui de JS.
package main

import (
	"encoding/json"
	"fmt"
)

type JSUndefined struct{}

type Union2[T0 any, T1 any] struct {
	Tag uint8
	V0  T0
	V1  T1
}

func (union Union2[T0, T1]) MarshalJSON() ([]byte, error) { return json.Marshal(union.V1) } // simplifié : Tag 0 est omis par omitzero

// interface Command { customerId: string; discountCode?: string }
type Command = struct {
	CustomerId   string                      `json:"customerId"`
	DiscountCode Union2[JSUndefined, string] `json:"discountCode,omitzero"`
}

type Raw = struct {
	CustomerId   string `json:"customerId"`
	DiscountCode string `json:"discountCode"`
}

func show(label string, value Command) {
	encoded, _ := json.Marshal(value)
	fmt.Println(label, string(encoded))
}

func main() {
	raw := Raw{CustomerId: "bob", DiscountCode: "VIP"}
	// Conversion champ par champ, dans une fonction appelée sur place.
	converted := func(source Raw) Command {
		return Command{CustomerId: source.CustomerId, DiscountCode: Union2[JSUndefined, string]{Tag: 1, V1: source.DiscountCode}}
	}(raw)
	show("converti       :", converted)

	// Ordre différent : JS afficherait {"discountCode":"VIP","customerId":"carol"}.
	show("ordre inversé  :", Command{CustomerId: "carol", DiscountCode: Union2[JSUndefined, string]{Tag: 1, V1: "VIP"}})
	// Champ en trop : JS afficherait aussi "note":"urgent", Go n'a pas de place pour lui.
	show("champ en trop  :", Command{CustomerId: "dave"})
}
