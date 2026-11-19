import { type Transformer } from "@transformer";
import { NodeBuilderFlags } from "typescript/async";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer, getInstantiatedSignature } from "../../../shared";
import { typeTransformers } from "../../../type";
import { eitherSuccessDependency, successFunctionIdentifier, successTypeIdentifier } from "./sharedDependency";

export async function successExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	if (!TsAST.isIdentifier(node) && !TsAST.isPropertyAccessExpression(node)) {
		return context.error(node, "un-support-success-reference");
	}

	// Appelée (`success(x)` via un appelé non simple) ou passée en valeur (`pipe(x, success)`).
	const signature = await getInstantiatedSignature(node, context);

	if (!signature) {
		return context.error(node, "un-support-success-without-instantiation");
	}

	const { typeChecker } = context.transpilation;

	const returnTypeNode = await typeChecker.typeToTypeNode(
		await typeChecker.getReturnTypeOfSignature(signature),
		node,
		NodeBuilderFlags.NoTruncation,
	);

	const valueTypeNode = returnTypeNode
		&& (TsAST.isTypeReferenceNode(returnTypeNode) || TsAST.isImportTypeNode(returnTypeNode))
		&& returnTypeNode.typeArguments
		&& DArray.first(returnTypeNode.typeArguments);

	if (!valueTypeNode) {
		return context.error(node, "un-support-success-type-argument");
	}

	const valueType = await DCommon.asyncPipe(
		context.transform(valueTypeNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	const packageName = context.registerSharedDependency(eitherSuccessDependency.value);

	return context.success({
		before: valueType.before,
		result: GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: packageName,
				identifier: successFunctionIdentifier,
			}),
			typeArguments: DCommon.cast([valueType.result]),
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
