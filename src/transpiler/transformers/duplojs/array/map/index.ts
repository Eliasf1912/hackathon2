import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { SignatureKind, type Signature } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { transformCheckerType } from "../../either/whenIsRight";
import { arrayMapDependency, arrayMapWithDependency, mapFunctionIdentifier, mapWithFunctionIdentifier } from "./sharedDependency";

export async function mapExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	const call = node.parent;

	if (!TsAST.isCallExpression(call) || call.expression !== node) {
		return context.notSupport();
	}

	// Direct form `map(array, theFunction)` or curried form `map(theFunction)`.
	const isCurried = DArray.lengthEqual(call.arguments, 1);
	const isDirect = DArray.lengthEqual(call.arguments, 2);

	if (!isCurried && !isDirect) {
		return context.notSupport();
	}

	const callbackIndex = isCurried ? 0 : 1;
	const callbackNode = DArray.at(call.arguments, callbackIndex);

	// The Go runtime only gives the element: the `{ index, self }` parameter is not translated.
	if (
		callbackNode
		&& (TsAST.isArrowFunction(callbackNode) || TsAST.isFunctionExpression(callbackNode))
		&& !DArray.lengthEqual(callbackNode.parameters, 0)
		&& !DArray.lengthEqual(callbackNode.parameters, 1)
	) {
		return context.notSupport();
	}

	const { typeChecker } = context.transpilation;
	const signature = await typeChecker.getResolvedSignature(call);
	const callbackSignature: Signature | undefined = DArray.first(
		await typeChecker.getSignaturesOfType(
			await typeChecker.getParameterType(signature, callbackIndex),
			SignatureKind.Call,
		),
	);

	if (!callbackSignature) {
		return context.error(call, "unresolved-map-callback");
	}

	const elementType = await transformCheckerType(
		await typeChecker.getParameterType(callbackSignature, 0),
		call,
		context,
	);

	if (DEither.isLeft(elementType)) {
		return elementType;
	}

	const outputType = await transformCheckerType(
		await typeChecker.getReturnTypeOfSignature(callbackSignature),
		call,
		context,
	);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const packageName = context.registerSharedDependency(arrayMapDependency.value);

	if (isCurried) {
		context.registerSharedDependency(arrayMapWithDependency.value);
	}

	return context.success({
		before: DArray.concat(elementType.before, outputType.before),
		result: GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: packageName,
				identifier: isCurried
					? mapWithFunctionIdentifier
					: mapFunctionIdentifier,
			}),
			typeArguments: DCommon.cast([elementType.result, outputType.result]),
		}),
	});
}
