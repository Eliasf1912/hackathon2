import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { adaptFunctionValue, getDeclaredParameterCount } from "../../../shared";
import { goTypeKey, transformCheckerType, type GoType } from "../../../type/union";
import { createCurriedFunction } from "../../curried";
import { bindOnce } from "../../either/isRight";
import { mapDependency, mapFunctionIdentifier } from "./sharedDependency";

interface PreparedFunction {
	before: readonly GoAST.Statement[];
	callee: GoAST.Expression;
	parameterCount: number;
	returnType: GoType;
}

async function prepareFunction(
	node: TsAST.CallExpression,
	functionNode: TsAST.Expression,
	parameterIndex: number,
	context: BuildContext,
) {
	const { typeChecker } = context.transpilation;

	const transformed = await DCommon.asyncPipe(
		context.transform(functionNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(transformed)) {
		return transformed;
	}

	const signature = DArray.first(
		await (await typeChecker.getParameterType(await typeChecker.getResolvedSignature(node), parameterIndex))
			.getCallSignatures(),
	);

	if (!signature) {
		return context.error(functionNode, "un-support-map-function-type");
	}

	const returnType = await transformCheckerType(
		await typeChecker.getReturnTypeOfSignature(signature),
		functionNode,
		context,
	);

	if (DEither.isLeft(returnType)) {
		return returnType;
	}

	const parameterCount = await getDeclaredParameterCount(functionNode, context);

	// shortcut: le second paramètre (`{ index, self }`) demande de traduire un objet,
	// à faire quand un exercice s'en servira.
	if (parameterCount >= 2) {
		return context.error(functionNode, "un-support-map-index-params");
	}

	const bound = bindOnce(transformed.result, context);

	return DEither.right("map-function", {
		before: DArray.concat(transformed.before, bound.before),
		callee: bound.result,
		parameterCount,
		returnType: DEither.unwrapRight(returnType),
	} satisfies PreparedFunction);
}

interface ApplyMapParams {
	node: TsAST.Node;
	array: GoAST.Expression;
	arrayType: GoType;
	outputType: GoType;
	theFunction: PreparedFunction;
}

function applyMap(
	{ node, array, arrayType, outputType, theFunction }: ApplyMapParams,
	context: BuildContext,
) {
	if (
		!DModeling.hasTagValue(arrayType, "[node][type]slice")
		|| !DModeling.hasTagValue(outputType, "[node][type]slice")
	) {
		return context.error(node, "un-support-map-array-type");
	}

	if (goTypeKey(theFunction.returnType) !== goTypeKey(outputType.elementType)) {
		return context.error(node, "un-support-map-element-conversion");
	}

	return DEither.right("map-applied", {
		before: [],
		result: GoAST.createCallExpression({
			callee: GoAST.createSelectorExpression({
				target: context.registerSharedDependency(mapDependency.value),
				identifier: mapFunctionIdentifier,
			}),
			arguments: [
				array,
				adaptFunctionValue({
					callee: theFunction.callee,
					parameterTypes: [arrayType.elementType],
					returnType: outputType.elementType,
					parameterCount: theFunction.parameterCount,
					generateIdentifier: () => context.generateIdentifier(),
				}),
			],
		}),
	});
}

/**
 * `DArray.map(array, f)` → `shard_dependencies.Map(array, f)`, et la forme curryfiée
 * `DArray.map(f)` → closure `func(array []T) []R { return Map(array, f) }`.
 *
 * Les types viennent du checker : tableau d'entrée et de sortie, type renvoyé par `f`.
 * Une fonction qui déclare moins de paramètres (`() => x`) est adaptée.
 */
export async function mapExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-map-as-value");
	}

	const isCurried = DArray.lengthEqual(node.arguments, 1);

	if (!isCurried && !DArray.lengthEqual(node.arguments, 2)) {
		return context.error(node, "un-support-map-arguments");
	}

	const functionNode = DArray.last(node.arguments);

	if (!functionNode) {
		return context.error(node, "un-support-map-arguments");
	}

	const theFunction = await prepareFunction(node, functionNode, isCurried ? 0 : 1, context);

	if (DEither.isLeft(theFunction)) {
		return theFunction;
	}

	const prepared = DEither.unwrapRight(theFunction);

	if (isCurried) {
		const curried = await createCurriedFunction(
			node,
			context,
			(input, inputType, outputType) => applyMap(
				{
					node,
					array: input,
					arrayType: inputType,
					outputType,
					theFunction: prepared,
				},
				context,
			),
		);

		if (DEither.isLeft(curried)) {
			return curried;
		}

		return context.success({
			before: prepared.before,
			result: DEither.unwrapRight(curried),
		});
	}

	const [arrayNode] = node.arguments;

	if (!arrayNode) {
		return context.error(node, "un-support-map-arguments");
	}

	const array = await DCommon.asyncPipe(
		context.transform(arrayNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(array)) {
		return array;
	}

	const { typeChecker } = context.transpilation;

	const arrayType = await transformCheckerType(await typeChecker.getTypeAtLocation(arrayNode), arrayNode, context);

	if (DEither.isLeft(arrayType)) {
		return arrayType;
	}

	const outputType = await transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	// Le tableau est lu avant la fonction, comme en JS.
	const boundArray = bindOnce(array.result, context);

	const applied = applyMap(
		{
			node,
			array: boundArray.result,
			arrayType: DEither.unwrapRight(arrayType),
			outputType: DEither.unwrapRight(outputType),
			theFunction: prepared,
		},
		context,
	);

	if (DEither.isLeft(applied)) {
		return applied;
	}

	return context.success({
		before: DArray.concat(array.before, boundArray.before, prepared.before),
		result: DEither.unwrapRight(applied).result,
	});
}
