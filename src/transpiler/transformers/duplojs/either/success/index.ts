import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import { NodeBuilderFlags } from "typescript/async";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { typeTransformers } from "../../../type";
import { eitherSuccessDependency, successFunctionIdentifier, successTypeIdentifier } from "./sharedDependency";

export async function successExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	const call = node.parent;
	const valueNode = TsAST.isCallExpression(call) && call.expression === node
		? DArray.first(call.arguments)
		: undefined;

	if (!valueNode) {
		return context.notSupport();
	}

	const { typeChecker } = context.transpilation;
	const valueType = await typeChecker.getBaseTypeOfLiteralType(
		await typeChecker.getTypeAtLocation(valueNode),
	);
	const valueTypeNode = await typeChecker.typeToTypeNode(valueType, call, NodeBuilderFlags.NoTruncation);

	if (!valueTypeNode) {
		return context.error(valueNode, "unresolved-success-value-type");
	}

	const typeArgument = await DCommon.asyncPipe(
		context.transform(valueTypeNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(typeArgument)) {
		return typeArgument;
	}

	const packageName = context.registerSharedDependency(eitherSuccessDependency.value);

	return context.success({
		before: typeArgument.before,
		result: GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: packageName,
				identifier: successFunctionIdentifier,
			}),
			typeArguments: DCommon.cast([typeArgument.result]),
		}),
	});
}

export async function successTypeHandler(
	node: TsAST.TypeReferenceNode | TsAST.ImportTypeNode,
	context: BuildContext,
) {
	const argumentNode = node.typeArguments && DArray.first(node.typeArguments);

	if (!argumentNode) {
		return context.notSupport();
	}

	const argument = await DCommon.asyncPipe(
		context.transform(argumentNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(argument)) {
		return argument;
	}

	return context.success({
		before: argument.before,
		result: GoAST.createGenericTypeReference({
			typeReference: GoAST.createPackageTypeReference({
				packageName: context.registerSharedDependency(eitherSuccessDependency.value),
				identifier: successTypeIdentifier,
			}),
			typeArguments: DCommon.cast([argument.result]),
		}),
	});
}
