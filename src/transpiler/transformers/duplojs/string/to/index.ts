import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { stringToDependency, toFunctionIdentifier } from "./sharedDependency";

export async function toExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	const packageName = context.registerSharedDependency(stringToDependency.value);

	return context.success({
		result: GoAST.createSelectorExpression({
			target: packageName,
			identifier: toFunctionIdentifier,
		}),
	});
}

