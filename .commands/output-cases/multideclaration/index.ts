import * as DCommon from "@duplojs/lang/common";

const a = 1, b = 2;
const first = a + b, second = first * 2;
let name = "a", count = 3;

function compute() {
	const x = 1, y = x + 1;
	const label = "total", values = [x, y, a, b];
	let total = x + y + second, text = `${label}: ${total}`;

	DCommon.print(values);
	DCommon.print(total);
	DCommon.print(text);
}

DCommon.print(a);
DCommon.print(b);
DCommon.print(second);
DCommon.print(`${name}${count}`);
compute();
