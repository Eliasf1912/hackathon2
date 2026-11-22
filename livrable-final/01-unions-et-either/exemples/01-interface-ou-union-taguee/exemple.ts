// Ce qu'il faut regarder : `add` renvoie « soit un succès, soit un échec ».
// Grâce aux marqueurs DuploJS, TS sait que `result` est un Right dans le if.
import * as DEither from "@duplojs/lang/either";
import * as DCommon from "@duplojs/lang/common";

export function add(one: number, two: number): DEither.Success<number> | DEither.Fail {
	if (one < 0) {
		return DEither.fail();
	}

	return DEither.success(one + two);
}

const result = add(1, 2);

if (DEither.isRight(result)) {
	DCommon.print(result);
}
