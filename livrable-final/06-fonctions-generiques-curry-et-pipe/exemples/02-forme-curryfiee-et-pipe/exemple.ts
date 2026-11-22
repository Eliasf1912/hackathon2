// Ce qu'il faut regarder : `whenIsRight(DArray.coalescing)` reçoit UNE fonction et renvoie une fonction.
// Le checker lui donne déjà un type concret : (input: Fail | Success<number>) => Fail | readonly [number].
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";

function add(one: number, two: number) {
	if (one < 0 || two < 0) {
		return DEither.fail();
	}
	return DEither.success(one + two);
}

const double = (value: number) => value * 2;
const toArrayIfRight = DEither.whenIsRight(DArray.coalescing); // forme curryfiée

DCommon.print(DCommon.pipe(add(1, 2), toArrayIfRight)); // [3]
DCommon.print(DCommon.pipe(2, double, double)); // 8 : pipe(x, f, g) vaut g(f(x))
