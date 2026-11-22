// Ce qu'il faut regarder : `Point` est un tuple de longueur 2, garantie par TS.
// En Go, cette longueur doit rester dans le type.
import * as DCommon from "@duplojs/lang/common";

type Point = readonly [number, number];

const origin: Point = [0, 0];
const path: Point[] = [[1, 2], [3, 4], [5, 6]];

function length(point: Point) {
	return Math.sqrt(point[0] * point[0] + point[1] * point[1]);
}

DCommon.print(origin); // [0,0]
DCommon.print(path); // [[1,2],[3,4],[5,6]]
DCommon.print(length(path[1])); // 5
