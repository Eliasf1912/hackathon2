import * as DCommon from "@duplojs/lang/common";

function negate(value: number) {
	return -value;
}

function times(left: number, right: number) {
	return left * right;
}

const zero = 0;

DCommon.print(-0);
DCommon.print(-(0));
DCommon.print(-(-0));
DCommon.print(-zero);
DCommon.print(negate(0));
DCommon.print(times(0, -1));
DCommon.print([-0, 0]);
DCommon.print({ value: -0 });
DCommon.print(`${-0}`);
DCommon.print(-5);
