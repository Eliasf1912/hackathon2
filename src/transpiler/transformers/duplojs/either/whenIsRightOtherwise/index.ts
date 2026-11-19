import { type Transformer } from "@transformer";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { SignatureKind, type Signature } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { createKindPredicate, createValueGetter, resolveEitherMembers, resolveInputType } from "../members";
import { useGoType } from "../../../../resolveGoType";
import { eitherWhenIsRightOtherwiseDependency, eitherWhenIsRightOtherwiseWithDependency, whenIsRightOtherwiseFunctionIdentifier, whenIsRightOtherwiseWithFunctionIdentifier } from "./sharedDependency";

export async function whenIsRightOtherwiseExpressionHandler(
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

	// Direct form `(input, theFunction, otherwise)` or curried form `(theFunction, otherwise)`.
	const isCurried = DArray.lengthEqual(call.arguments, 2);
	const isDirect = DArray.lengthEqual(call.arguments, 3);

	if (!isCurried && !isDirect) {
		return context.notSupport();
	}

	const { typeChecker } = context.transpilation;
	const signature = await typeChecker.getResolvedSignature(call);
	const firstCallbackIndex = isCurried ? 0 : 1;

	const theFunctionSignature: Signature | undefined = DArray.first(
		await typeChecker.getSignaturesOfType(
			await typeChecker.getParameterType(signature, firstCallbackIndex),
			SignatureKind.Call,
		),
	);
	const otherwiseSignature: Signature | undefined = DArray.first(
		await typeChecker.getSignaturesOfType(
			await typeChecker.getParameterType(signature, firstCallbackIndex + 1),
			SignatureKind.Call,
		),
	);

	if (!theFunctionSignature || !otherwiseSignature) {
		return context.error(call, "unresolved-when-is-right-otherwise-callbacks");
	}

	const valueType = await useGoType(
		await typeChecker.getParameterType(theFunctionSignature, 0),
		call,
		context,
	);

	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	const otherwiseType = await useGoType(
		await typeChecker.getParameterType(otherwiseSignature, 0),
		call,
		context,
	);

	if (DEither.isLeft(otherwiseType)) {
		return otherwiseType;
	}

	const theFunctionOutputType = await useGoType(
		await typeChecker.getReturnTypeOfSignature(theFunctionSignature),
		call,
		context,
	);

	if (DEither.isLeft(theFunctionOutputType)) {
		return theFunctionOutputType;
	}

	const otherwiseOutputType = await useGoType(
		await typeChecker.getReturnTypeOfSignature(otherwiseSignature),
		call,
		context,
	);

	if (DEither.isLeft(otherwiseOutputType)) {
		return otherwiseOutputType;
	}

	// Go functions have a single result type: both branches must agree on it.
	if (
		!DCommon.equal(
			GoPrinter.renderNode(theFunctionOutputType),
			GoPrinter.renderNode(otherwiseOutputType),
		)
	) {
		return context.error(call, "when-is-right-otherwise-outputs-differ");
	}

	const inputType = await resolveInputType(signature, isCurried, context);

	if (!inputType) {
		return context.error(call, "unresolved-when-is-right-otherwise-input");
	}

	const members = await resolveEitherMembers(inputType, call, context);

	if (DEither.isLeft(members)) {
		return members;
	}

	const packageName = context.registerSharedDependency(eitherWhenIsRightOtherwiseDependency.value);

	if (isCurried) {
		context.registerSharedDependency(eitherWhenIsRightOtherwiseWithDependency.value);
	}

	return context.success({
		result: GoAST.createCallExpression({
			callee: GoAST.createInstantiationExpression({
				target: GoAST.createSelectorExpression({
					target: packageName,
					identifier: isCurried
						? whenIsRightOtherwiseWithFunctionIdentifier
						: whenIsRightOtherwiseFunctionIdentifier,
				}),
				typeArguments: DCommon.cast([
					valueType,
					otherwiseType,
					theFunctionOutputType,
				]),
			}),
			arguments: [
				createKindPredicate(members, "right", context),
				createValueGetter(members, valueType, context),
			],
		}),
	});
}
