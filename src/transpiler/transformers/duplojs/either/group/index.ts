import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { SignatureKind } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { createKindPredicate, createValueGetter, resolveEitherMembers, resolveMembersValueType } from "../members";
import { eitherSuccessDependency } from "../success/sharedDependency";
import { useGoType } from "../../../../resolveGoType";
import { eitherGroupDependency, eitherGroupOfGettersDependency, groupFunctionIdentifier, groupOfGettersFunctionIdentifier } from "./sharedDependency";

export async function groupExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	const call = node.parent;
	const groupNode = TsAST.isCallExpression(call) && call.expression === node
		? DArray.first(call.arguments)
		: undefined;

	if (!groupNode) {
		return context.notSupport();
	}

	const { typeChecker } = context.transpilation;
	const groupType = await typeChecker.getTypeAtLocation(groupNode);
	const itemType = await groupType.getNumberIndexType();

	// Only an array is translated, not an object.
	if (!itemType || !(await typeChecker.isArrayLikeType(groupType))) {
		return context.notSupport();
	}

	// Items are either the results, or getters `() => result` called in turn.
	const getterSignature = DArray.first(
		await typeChecker.getSignaturesOfType(itemType, SignatureKind.Call),
	);

	if (getterSignature && !DArray.lengthEqual(getterSignature.parameters, 0)) {
		return context.notSupport();
	}

	const resultType = getterSignature
		? await typeChecker.getReturnTypeOfSignature(getterSignature)
		: itemType;

	const elementGoType = await useGoType(resultType, call, context);

	if (DEither.isLeft(elementGoType)) {
		return elementGoType;
	}

	const members = await resolveEitherMembers(resultType, call, context);

	if (DEither.isLeft(members)) {
		return members;
	}

	const valueType = resolveMembersValueType(members, "right");
	context.registerSharedDependency(eitherSuccessDependency.value);
	const packageName = context.registerSharedDependency(
		getterSignature
			? eitherGroupOfGettersDependency.value
			: eitherGroupDependency.value,
	);

	return context.success({
		result: GoAST.createCallExpression({
			callee: GoAST.createInstantiationExpression({
				target: GoAST.createSelectorExpression({
					target: packageName,
					identifier: getterSignature
						? groupOfGettersFunctionIdentifier
						: groupFunctionIdentifier,
				}),
				typeArguments: DCommon.cast([elementGoType, valueType]),
			}),
			arguments: [
				createKindPredicate(members, "right", context),
				createValueGetter(members, valueType, context),
			],
		}),
	});
}
