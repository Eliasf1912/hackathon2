import * as DCommon from "@duplojs/lang/common";

function rest(one: number, two: number) {
	return one % two;
}

const one = 7;
const two = 3;

DCommon.print(one % two);
DCommon.print(-7 % 3);
DCommon.print(rest(-7, 3));
DCommon.print(rest(7.5, 2));
DCommon.print(rest(7, -3));
