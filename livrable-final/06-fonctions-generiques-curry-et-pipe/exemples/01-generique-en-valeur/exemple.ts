// Ce qu'il faut regarder : `DArray.coalescing` est générique et n'est pas appelée ici, elle est PASSÉE.
// Le checker sait qu'ici elle vaut (value: number) => readonly [number] : c'est ce type que Go recopie.
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";

function add(one: number, two: number) {
	if (one < 0 || two < 0) {
		return DEither.fail();
	}
	return DEither.success(one + two);
}

DCommon.print(DEither.whenIsRight(add(1, 2), DArray.coalescing)); // [3]
DCommon.print(DEither.whenIsRight(add(-1, 2), DArray.coalescing)); // le Fail, inchangé
