import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { NodeBuilderFlags, SignatureKind, type Type } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { typeTransformers } from "../../../type";
import { registerEitherRuntime } from "../isRight";
import { createKindPredicate, createValueGetter, resolveEitherMembers, resolveInputType } from "../members";
import { eitherWhenIsRightDependency, eitherWhenIsRightWithDependency, whenIsRightFunctionIdentifier, whenIsRightWithFunctionIdentifier } from "./sharedDependency";

export async function transformCheckerType(
	type: Type,
	enclosingNode: TsAST.Node,
	context: BuildContext,
) {
	const typeNode = await context.transpilation.typeChecker.typeToTypeNode(
		type,
		enclosingNode,
		NodeBuilderFlags.NoTruncation,
	);

	if (!typeNode) {
		return context.error(enclosingNode, "unresolved-checker-type");
	}

	return DCommon.asyncPipe(
		context.transform(typeNode, typeTransformers.value),
		DEither.unwrapRight,
	);
}

export async function whenIsRightExpressionHandler(
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

	// Direct form `whenIsRight(input, theFunction)` or curried form `whenIsRight(theFunction)`.
	const isCurried = DArray.lengthEqual(call.arguments, 1);
	const isDirect = DArray.lengthEqual(call.arguments, 2);

	if (!isCurried && !isDirect) {
		return context.notSupport();
	}

	const { typeChecker } = context.transpilation;
	const signature = await typeChecker.getResolvedSignature(call);
	const callbackType = await typeChecker.getParameterType(signature, isCurried ? 0 : 1);
	const callbackSignature = DArray.first(
		await typeChecker.getSignaturesOfType(callbackType, SignatureKind.Call),
	);

	if (!callbackSignature) {
		return context.error(call, "unresolved-when-is-right-callback");
	}

	const valueType = await transformCheckerType(
		await typeChecker.getParameterType(callbackSignature, 0),
		call,
		context,
	);

	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	const outputType = await transformCheckerType(
		await typeChecker.getReturnTypeOfSignature(callbackSignature),
		call,
		context,
	);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const inputType = await resolveInputType(signature, isCurried, context);

	if (!inputType) {
		return context.error(call, "unresolved-when-is-right-input");
	}

	const members = await resolveEitherMembers(inputType, call, context);

	if (DEither.isLeft(members)) {
		return members;
	}

	const runtimePackage = registerEitherRuntime(context);
	const packageName = context.registerSharedDependency(eitherWhenIsRightDependency.value);

	if (isCurried) {
		context.registerSharedDependency(eitherWhenIsRightWithDependency.value);
	}

	return context.success({
		before: DArray.concat(valueType.before, outputType.before),
		result: GoAST.createCallExpression({
			callee: GoAST.createInstantiationExpression({
				target: GoAST.createSelectorExpression({
					target: packageName,
					identifier: isCurried
						? whenIsRightWithFunctionIdentifier
						: whenIsRightFunctionIdentifier,
				}),
				typeArguments: DCommon.cast([valueType.result, outputType.result]),
			}),
			arguments: [
				createKindPredicate(members, "right", runtimePackage),
				createValueGetter(members, valueType.result, context),
			],
		}),
	});
}
