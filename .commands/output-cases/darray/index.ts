import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";

const values = [1, 2, 3, 4, 5];

DCommon.print(DArray.filter(values, (value) => value > 2));
DCommon.print(DArray.find(values, (value) => value > 3));
DCommon.print(DArray.find(values, (value) => value > 10));
DCommon.print(
	DArray.reduce(
		values,
		DArray.reduceFrom(0),
		({ element, lastValue, next }) => next(lastValue + element),
	),
);
DCommon.print(DCommon.pipe(values, DArray.filter((value) => value % 2 === 1)));
