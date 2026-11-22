// Ce qu'il faut regarder : une « variante » au sens du banc.
// On force le chemin d'erreur (division par zéro) et une valeur piégeuse (-2.5).
// (Même programme que 01-traduction-juste : seule la traduction Go change.)
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";

function divide(value: number, divisor: number) {
	if (divisor === 0) {
		return DEither.left("division-by-zero", value);
	}
	return DEither.success(value / divisor);
}

const prices = [2.5, -2.5, 0.5];

DCommon.print(DArray.map(prices, (price) => Math.round(price)));
DCommon.print(DEither.isLeft(divide(7, 0)));
DCommon.print(DEither.isLeft(divide(7, 2)));

// Sortie Node :
// [ 3, -2, 1 ]
// true
// false
