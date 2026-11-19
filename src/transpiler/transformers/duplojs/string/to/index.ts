import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { resolveValueType } from "../../array/coalescing";
import { transformCheckerType } from "../../either/whenIsRight";
import { stringToDependency, toFunctionIdentifier } from "./sharedDependency";

export async function toExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	if (!TsAST.isPropertyAccessExpression(node) && !TsAST.isIdentifier(node)) {
		return context.notSupport();
	}

	const valueType = await resolveValueType(node, context);

	if (!valueType) {
		return context.notSupport();
	}

	const typeArgument = await transformCheckerType(valueType, node, context);

	if (DEither.isLeft(typeArgument)) {
		return typeArgument;
	}

	const packageName = context.registerSharedDependency(stringToDependency.value);

	return context.success({
		before: typeArgument.before,
		result: GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: packageName,
				identifier: toFunctionIdentifier,
			}),
			typeArguments: DCommon.cast([typeArgument.result]),
		}),
	});
}
