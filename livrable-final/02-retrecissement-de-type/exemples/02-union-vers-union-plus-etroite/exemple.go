// Ce qu'il faut regarder : `return valeur` après isLeft fait DEUX conversions sur place, 1. rétrécir
// (Union3 -> Union2) puis 2. élargir (Union2 -> Union3). La case exclue par TS finit en `panic`, jamais pris.
package main

import "fmt"

type Union2[T0, T1 any] struct {
	Tag uint8
	V0  T0
	V1  T1
}
type Union3[T0, T1, T2 any] struct {
	Tag uint8
	V0  T0
	V1  T1
	V2  T2
}
type EitherError struct{ Information string } // variantes simplifiées
type EitherLeft struct{ Information string }
type Valeur = Union3[EitherError, EitherLeft, string]  // déclaré : Error | Left | string
type Echec = Union2[EitherError, EitherLeft]           // après isLeft : Error | Left
type Mesure = Union3[EitherError, EitherLeft, float64] // retour (simplifié) : Error | Left | number

func mesurer(valeur Valeur) Mesure {
	if valeur.Tag == 0 || valeur.Tag == 1 { // isLeft : Error et Left sont des "left"
		return func(s Echec) Mesure { // 2. élargir
			if s.Tag == 0 {
				return Mesure{Tag: 0, V0: s.V0}
			}
			if s.Tag == 1 {
				return Mesure{Tag: 1, V1: s.V1}
			}
			panic("unreachable union variant")
		}(func(s Valeur) Echec { // 1. rétrécir
			if s.Tag == 0 {
				return Echec{Tag: 0, V0: s.V0}
			}
			if s.Tag == 1 {
				return Echec{Tag: 1, V1: s.V1}
			}
			panic("unreachable union variant") // la string : exclue par TS
		}(valeur))
	}
	return Mesure{Tag: 2, V2: float64(len(valeur.V2))} // TS : string ici -> `valeur.V2`
}

func main() {
	fmt.Printf("%+v\n", mesurer(Valeur{Tag: 2, V2: "alice"}))                                     // une string
	fmt.Printf("%+v\n", mesurer(Valeur{Tag: 1, V1: EitherLeft{Information: "contient-chiffre"}})) // un Left
}
