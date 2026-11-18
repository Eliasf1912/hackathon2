import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer, getInstantiatedSignature } from "../../../shared";
import { transformCheckerType } from "../../../type/union";
import { coalescingArrayIdentifier, coalescingDependency, coalescingValueIdentifier } from "./sharedDependency";

/**
 * `DArray.coalescing` → `shard_dependencies.CoalescingValue[T]` ou `CoalescingArray[T]`,
 * instancié : une fonction Go générique ne peut être passée en valeur qu'instanciée.
 */
export async function coalescingExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	if (!TsAST.isIdentifier(node) && !TsAST.isPropertyAccessExpression(node)) {
		return context.error(node, "un-support-coalescing-reference");
	}

	const signature = await getInstantiatedSignature(node, context);

	if (!signature) {
		return context.error(node, "un-support-coalescing-without-instantiation");
	}

	const { typeChecker } = context.transpilation;
	const parameterType = await typeChecker.getParameterType(signature, 0);
	const isArray = await typeChecker.isArrayType(parameterType)
		|| await typeChecker.isTupleType(parameterType);

	const goParameterType = await transformCheckerType(parameterType, node, context);

	if (DEither.isLeft(goParameterType)) {
		return goParameterType;
	}

	const parameter = DEither.unwrapRight(goParameterType);

	const typeArgument = isArray && DModeling.hasTagValue(parameter, "[node][type]slice")
		? parameter.elementType
		: parameter;

	if (isArray && typeArgument === parameter) {
		return context.error(node, "un-support-coalescing-array-type");
	}

	return context.success({
		result: GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: context.registerSharedDependency(coalescingDependency.value),
				identifier: isArray ? coalescingArrayIdentifier : coalescingValueIdentifier,
			}),
			typeArguments: DCommon.cast([typeArgument]),
		}),
	});
}
