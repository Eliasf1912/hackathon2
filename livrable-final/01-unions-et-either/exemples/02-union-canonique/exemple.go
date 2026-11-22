// Ce qu'il faut regarder : les deux ordres TS (`number | string`, `string | number`)
// donnent le même type Go, donc `var memeId … = id` compile sans conversion.
// Et la valeur zéro de `Surnom` est déjà `undefined` (Tag 0), sans rien écrire.
package main

import "fmt"

type Union2[T0, T1 any] struct {
	Tag uint8
	V0  T0
	V1  T1
}

type JSUndefined struct{}

// 1. "rouge" | "vert" : deux fois string -> dédoublonné -> pas d'union du tout.
type Couleur = string

// 2. Membres triés par leur écriture Go : "float64" < "string".
type Identifiant = Union2[float64, string]        // number | string
type IdentifiantInverse = Union2[float64, string] // string | number

// 3. string | undefined : JSUndefined toujours en case 0.
type Surnom = Union2[JSUndefined, string]

func main() {
	var couleur Couleur = "vert"
	id := Identifiant{Tag: 0, V0: 42} // 42 est un number : case 0 (float64)
	var memeId IdentifiantInverse = id
	var surnom Surnom // `let surnom;`

	fmt.Println(couleur)
	fmt.Println(memeId.V0)
	fmt.Println(surnom.Tag == 0) // `surnom === undefined`
}
