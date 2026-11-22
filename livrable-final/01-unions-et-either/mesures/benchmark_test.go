package benchmark_test

import (
	"testing"
	"unsafe"
)

// ============================================================================
// PROBLÉMATIQUE 1 : Modélisation des retours DEither (UnionN vs Value any)
// ============================================================================

// --- Modèle A : Notre architecture UnionN (Typage statique générique) ---

type JSNull struct{}

type JSUndefined struct{}

type EitherFail struct {
	Left        JSNull
	Information string
	Value       JSUndefined // comme le Go généré : fail() porte la valeur undefined
	Fail        JSNull
}

type EitherSuccess[T any] struct {
	Right       JSNull
	Information string
	Value       T
	Success     JSNull
}

type Union2[T0 any, T1 any] struct {
	Tag uint8
	V0  T0
	V1  T1
}

//go:noinline
func addUnion(a, b float64) Union2[EitherFail, EitherSuccess[float64]] {
	if a < 0 || b < 0 {
		return Union2[EitherFail, EitherSuccess[float64]]{
			Tag: 0,
			V0: EitherFail{
				Information: "negative-operand",
			},
		}
	}
	return Union2[EitherFail, EitherSuccess[float64]]{
		Tag: 1,
		V1: EitherSuccess[float64]{
			Information: "success",
			Value:       a + b,
		},
	}
}

// --- Modèle B : L'alternative par conteneur générique (Value any) ---

type EitherAny struct {
	Tag   uint8
	Value any // boxing dynamique du float64 sur le tas (heap)
}

//go:noinline
func addAny(a, b float64) EitherAny {
	if a < 0 || b < 0 {
		return EitherAny{
			Tag:   0,
			Value: "negative-operand",
		}
	}
	return EitherAny{
		Tag:   1,
		Value: a + b, // conversion dynamique float64 -> interface{}
	}
}

// Test de validation des tailles mémoire réelles avec unsafe.Sizeof
func TestMemorySizes(t *testing.T) {
	sizeUnion2 := unsafe.Sizeof(Union2[EitherFail, EitherSuccess[float64]]{})
	sizeFail := unsafe.Sizeof(EitherFail{})
	sizeSuccess := unsafe.Sizeof(EitherSuccess[float64]{})
	sizeAny := unsafe.Sizeof(EitherAny{})

	t.Logf("Taille Union2[EitherFail, EitherSuccess[float64]] : %d octets (ligne de cache = 64 octets)", sizeUnion2)
	t.Logf("Taille EitherFail                                 : %d octets", sizeFail)
	t.Logf("Taille EitherSuccess[float64]                    : %d octets", sizeSuccess)
	t.Logf("Taille EitherAny                                 : %d octets", sizeAny)

	if sizeUnion2 != 64 {
		t.Errorf("Attention : taille inattendue pour Union2, attendu 64, obtenu %d", sizeUnion2)
	}
}

func BenchmarkUnionN_Typed(b *testing.B) {
	var total float64
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		res := addUnion(1.5, 2.5)
		if res.Tag == 1 {
			total += res.V1.Value // Accès direct au champ typé sans assertion
		}
	}
	_ = total
}

func BenchmarkAny_Dynamic(b *testing.B) {
	var total float64
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		res := addAny(1.5, 2.5)
		if res.Tag == 1 {
			total += res.Value.(float64) // Type assertion dynamique
		}
	}
	_ = total
}

// ============================================================================
// PROBLÉMATIQUE 2 : Gestion des Collections DArray.map (make pré-alloué vs append)
// ============================================================================

// Notre solution : allocation directe à la capacité exacte connue
func mapPreallocated[T any, R any](array []T, transform func(T) R) []R {
	result := make([]R, len(array))
	for index, element := range array {
		result[index] = transform(element)
	}
	return result
}

// L'approche naïve : tranche vide et agrandissements dynamiques successifs
func mapAppendDynamic[T any, R any](array []T, transform func(T) R) []R {
	var result []R
	for _, element := range array {
		result = append(result, transform(element))
	}
	return result
}

func BenchmarkMap_Preallocated_100Elements(b *testing.B) {
	input := make([]float64, 100)
	for i := range input {
		input[i] = float64(i)
	}
	transform := func(x float64) float64 { return x * 2.0 }

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		res := mapPreallocated(input, transform)
		_ = res
	}
}

func BenchmarkMap_AppendDynamic_100Elements(b *testing.B) {
	input := make([]float64, 100)
	for i := range input {
		input[i] = float64(i)
	}
	transform := func(x float64) float64 { return x * 2.0 }

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		res := mapAppendDynamic(input, transform)
		_ = res
	}
}

