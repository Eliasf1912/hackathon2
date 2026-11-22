// Ce qu'il faut regarder : `calculate` est async, et `asyncGroup` appelle les getters UN PAR UN.
// Au premier Left, il s'arrête : le 3ᵉ getter n'est jamais appelé.
import * as DEither from "@duplojs/lang/either";
import * as DCommon from "@duplojs/lang/common";

async function calculate(value: number, divisor: number) {
	return DEither.rightAsyncPipe(
		DEither.success(value),
		(current) => (divisor === 0 ? DEither.left("division-by-zero", divisor) : DEither.success(current / divisor)),
		(current) => DEither.success(current * 2),
	);
}

const oneFails = DEither.asyncGroup([
	() => calculate(6, 3),
	() => calculate(1, 0), // division par zéro : Left
	() => calculate(9, 3), // jamais appelé
]);

DCommon.print(await oneFails); // Left "division-by-zero"
