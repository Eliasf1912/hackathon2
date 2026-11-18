import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { isRightMethodIdentifier } from "./sharedDependency";

/**
 * `DEither.isRight(x)` → `x.IsRight()`.
 *
 * Un appel de méthode, et non de fonction : toutes les variantes d'Either et l'interface
 * `Either` ont cette méthode. Cela marche donc pour n'importe quel Either ou union d'Either,
 * sans test de type par variante ni instanciation générique.
 *
 * Limite connue : `isRight` utilisé comme valeur (`DArray.filter(list, DEither.isRight)`)
 * n'est pas encore pris en charge.
 */
export async function isRightExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-isRight-as-value");
	}

	const input = DArray.first(node.arguments);

	if (!input || !DArray.lengthEqual(node.arguments, 1)) {
		return context.error(node, "un-support-isRight-arguments");
	}

	const either = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(either)) {
		return either;
	}

	return context.success({
		before: either.before,
		result: GoAST.createCallExpression({
			callee: GoAST.createSelectorExpression({
				target: either.result,
				identifier: isRightMethodIdentifier,
			}),
			arguments: [],
		}),
	});
}
