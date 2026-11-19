import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { transformCheckerType } from "../whenIsRight";
import { typeTransformers } from "../../../type";
import { eitherLeftDependency, eitherLeftTypeDependency, leftFunctionIdentifier, leftTypeIdentifier } from "./sharedDependency";

/**
 * `DEither.Left<information, value>` becomes `EitherLeft[value]`: the
 * information is stored in the struct field at runtime.
 */
export async function leftTypeHandler(
	node: TsAST.TypeReferenceNode | TsAST.ImportTypeNode,
	context: BuildContext,
) {
	const valueNode = node.typeArguments && DArray.at(node.typeArguments, 1);

	if (!valueNode) {
		return context.notSupport();
	}

	const valueType = await DCommon.asyncPipe(
		context.transform(valueNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	return context.success({
		before: valueType.before,
		result: GoAST.createGenericTypeReference({
			typeReference: GoAST.createPackageTypeReference({
				packageName: context.registerSharedDependency(eitherLeftTypeDependency.value),
				identifier: leftTypeIdentifier,
			}),
			typeArguments: DCommon.cast([valueType.result]),
		}),
	});
}

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
	const valueType = await transformCheckerType(
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
		before: valueType.before,
		result: GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: packageName,
				identifier: leftFunctionIdentifier,
			}),
			typeArguments: DCommon.cast([valueType.result]),
		}),
	});
}
