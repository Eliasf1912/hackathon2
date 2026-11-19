import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { useGoType } from "../../../../resolveGoType";
import { eitherLeftDependency, eitherLeftTypeDependency, leftFunctionIdentifier } from "./sharedDependency";

export async function leftExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	const call = node.parent;

	// Only `left(information, value)` is translated: a Left without value is not.
	if (
		!TsAST.isCallExpression(call)
		|| call.expression !== node
		|| !DArray.lengthEqual(call.arguments, 2)
	) {
		return context.notSupport();
	}

	const valueNode = DArray.at(call.arguments, 1);

	if (!valueNode) {
		return context.notSupport();
	}

	const { typeChecker } = context.transpilation;
	const valueType = await useGoType(
		await typeChecker.getBaseTypeOfLiteralType(
			await typeChecker.getTypeAtLocation(valueNode),
		),
		call,
		context,
	);

	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	context.registerSharedDependency(eitherLeftTypeDependency.value);
	const packageName = context.registerSharedDependency(eitherLeftDependency.value);

	return context.success({
		result: GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: packageName,
				identifier: leftFunctionIdentifier,
			}),
			typeArguments: DCommon.cast([valueType]),
		}),
	});
}
