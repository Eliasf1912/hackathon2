import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { SignatureKind } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { useGoType } from "../../../../resolveGoType";
import { arrayCoalescingDependency, coalescingFunctionIdentifier } from "./sharedDependency";

/**
 * Type of the single value given to a one-argument function, whether the
 * function is called directly or passed as a callback.
 */
export async function resolveValueType(
	node: TsAST.Expression,
	context: BuildContext,
) {
	const { typeChecker } = context.transpilation;
	const call = node.parent;

	// Called directly: the value is the first argument.
	if (TsAST.isCallExpression(call) && call.expression === node) {
		const valueNode = DArray.first(call.arguments);

		return valueNode
			&& typeChecker.getBaseTypeOfLiteralType(await typeChecker.getTypeAtLocation(valueNode));
	}

	// Passed as a function: the value type comes from the expected callback.
	const contextualType = await typeChecker.getContextualType(node);
	const contextualSignature = contextualType && DArray.first(
		await typeChecker.getSignaturesOfType(contextualType, SignatureKind.Call),
	);

	return contextualSignature && typeChecker.getParameterType(contextualSignature, 0);
}

export async function coalescingExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	if (!TsAST.isPropertyAccessExpression(node) && !TsAST.isIdentifier(node)) {
		return context.notSupport();
	}

	const { typeChecker } = context.transpilation;
	const valueType = await resolveValueType(node, context);

	// An array value is returned as is by `coalescing`: not translated yet.
	if (!valueType || await typeChecker.isArrayLikeType(valueType)) {
		return context.notSupport();
	}

	const typeArgument = await useGoType(valueType, node, context);

	if (DEither.isLeft(typeArgument)) {
		return typeArgument;
	}

	const packageName = context.registerSharedDependency(arrayCoalescingDependency.value);

	return context.success({
		result: GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: packageName,
				identifier: coalescingFunctionIdentifier,
			}),
			typeArguments: DCommon.cast([typeArgument]),
		}),
	});
}
