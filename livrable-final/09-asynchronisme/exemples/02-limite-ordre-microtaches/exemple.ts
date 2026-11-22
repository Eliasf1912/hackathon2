// Ce qu'il faut regarder : un print placé ENTRE la création de la promesse et son await.
// JS affiche « après, 1, 2 » (le corps d'asyncGroup démarre en microtâche) ; Go synchrone : « 1, 2, après ».
import * as DEither from "@duplojs/lang/either";
import * as DCommon from "@duplojs/lang/common";

async function step(value: number) {
	DCommon.print(value);
	return DEither.success(value);
}

const promise = DEither.asyncGroup([() => step(1), () => step(2)]);
DCommon.print("après");
await promise;
