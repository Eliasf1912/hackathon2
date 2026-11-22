// Ce qu'il faut regarder : la variable Go `valeur` garde son type Union2 du début à la fin.
// À chaque lecture, le transpileur compare ce type au type que TS donne ICI.
// S'ils diffèrent, il lit directement la bonne case : `valeur.V0` ou `valeur.V1`.
package main

import (
	"fmt"
	"strings"
	"unicode/utf16"
)

type Union2[T0, T1 any] struct {
	Tag uint8
	V0  T0
	V1  T1
}

type EitherLeft struct{ Information string } // simplifié

type Valeur = Union2[EitherLeft, string]    // Left | string
type Resultat = Union2[float64, EitherLeft] // number | Left (trié : "float64" en premier)

func mesurer(nom string) Resultat {
	// verifier + unwrapRight, simplifiés : un Left si "@", sinon la string.
	valeur := Valeur{Tag: 1, V1: nom}
	if strings.Contains(nom, "@") {
		valeur = Valeur{Tag: 0, V0: EitherLeft{Information: "contient-arobase"}}
	}

	if valeur.Tag == 0 { // isLeft(valeur)
		// TS : Left ici -> `valeur.V0`, puis emballé vers la case 1 du type de retour.
		return Resultat{Tag: 1, V1: valeur.V0}
	}
	// TS : string ici -> `valeur.V1`. Longueur en unités UTF-16, comme `.length` en JS.
	return Resultat{Tag: 0, V0: float64(len(utf16.Encode([]rune(valeur.V1))))}
}

func main() {
	for _, nom := range []string{"alice", "a@b"} {
		r := mesurer(nom)
		if r.Tag == 0 {
			fmt.Println(nom, "-> longueur", r.V0)
		} else {
			fmt.Println(nom, "-> Left", r.V1.Information)
		}
	}
}
