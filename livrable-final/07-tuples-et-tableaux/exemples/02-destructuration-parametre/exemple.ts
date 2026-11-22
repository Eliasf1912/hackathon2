// Ce qu'il faut regarder : chaque position du tuple reçoit un nom dans le paramètre.
// Un élément omis (`[, second]`) n'est pas lié.
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";

const inputs: [number, number, number][] = [
	[1, 2, 1],
	[4, 5, 3],
	[2, 3, 2],
];

const results = DArray.map(inputs, ([one, two, divisor]) => (one + two) / divisor);
const seconds = DArray.map(inputs, ([, second]) => second);

DCommon.print(results); // [3,3,2.5]
DCommon.print(seconds); // [2,5,3]
