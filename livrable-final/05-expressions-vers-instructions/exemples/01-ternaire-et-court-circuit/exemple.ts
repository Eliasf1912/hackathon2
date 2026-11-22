// Ce qu'il faut regarder : `||` n'appelle pas son côté droit si le gauche est vrai,
// et le ternaire n'évalue que la branche choisie. `calls` compte les appels.
import * as DCommon from "@duplojs/lang/common";

let calls = 0;

function isNegative(value: number) {
	calls += 1;
	return value < 0;
}

function firstNegative(one: number, two: number) {
	return isNegative(one) || isNegative(two) ? (one < 0 ? one : two) : 0;
}

DCommon.print(firstNegative(-1, 5)); // -1, calls = 1 (court-circuit)
DCommon.print(firstNegative(3, -7)); // -7, calls = 3
DCommon.print(firstNegative(3, 4)); // 0,  calls = 5
DCommon.print(calls); // 5
