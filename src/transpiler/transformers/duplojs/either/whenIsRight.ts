import { GoAST } from "@go";
import { type NotfoundTransformer, type TransformationError } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { createFunctionValueCall, getDeclaredParameterCount } from "../../shared";
import {
	convertToType,
	createUnionTagTest,
	createUnionVariantAccess,
	getUnionType,
	transformCheckerType,
	type GoType,
} from "../../type/union";
import { createCurriedFunction } from "../curried";
import { bindOnce } from "./isRight";
import { isRightVariantType, valueFieldIdentifier } from "./sharedDependency";

interface Variant {
	type: GoType;
	access: GoAST.Expression;
	tagTest?: GoAST.Expression;
}

/**
 * Fonction reçue par `whenIsRight` / `whenIsRightOtherwise`, transformée et rangée
 * (évaluée une fois), avec ses types instanciés.
 */
interface FunctionBranch {
	before: readonly GoAST.Statement[];
	callee: GoAST.Expression;
	parameterType: GoType;
	returnType: GoType;
	parameterCount: number;
}

interface ApplyWhenParams {
	node: TsAST.Node;
	input: GoAST.Expression;
	inputType: GoType;
	outputType: GoType;
	right: FunctionBranch;
	otherwise?: FunctionBranch;
}

/**
 * Prépare la fonction `functionNode`, reçue au paramètre `parameterIndex` de l'appel.
 * Ses types viennent de la signature résolue (donc instanciée) ; son nombre de paramètres,
 * de sa propre déclaration (`() => [-12]` n'en prend aucun).
 */
async function prepareFunction(
	node: TsAST.CallExpression,
	functionNode: TsAST.Expression,
	parameterIndex: number,
	context: BuildContext,
): Promise<TransformationError | NotfoundTransformer | DEither.Right<"function-branch", FunctionBranch>> {
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
		return context.error(functionNode, "un-support-when-function-type");
	}

	const parameterType = await transformCheckerType(
		await typeChecker.getParameterType(signature, 0),
		functionNode,
		context,
	);

	if (DEither.isLeft(parameterType)) {
		return parameterType;
	}

	const returnType = await transformCheckerType(
		await typeChecker.getReturnTypeOfSignature(signature),
		functionNode,
		context,
	);

	if (DEither.isLeft(returnType)) {
		return returnType;
	}

	const bound = bindOnce(transformed.result, context);

	return DEither.right("function-branch", {
		before: DArray.concat(transformed.before, bound.before),
		callee: bound.result,
		parameterType: DEither.unwrapRight(parameterType),
		returnType: DEither.unwrapRight(returnType),
		parameterCount: await getDeclaredParameterCount(functionNode, context),
	});
}

/**
 * `_ = f` : une fonction rangée dans une variable mais jamais appelée (aucune variante
 * concernée) doit être utilisée pour que Go compile ; comme en JS, elle reste évaluée.
 */
function markUsed(branch: FunctionBranch) {
	return GoAST.createAssignmentStatement({
		targets: DCommon.cast([GoAST.createIdentifier("_")]),
		values: DCommon.cast([branch.callee]),
	});
}

/**
 * Cœur commun : une branche par variante de `input`, chacune convertie vers le type Go
 * du résultat.
 *
 * - variante Right : `right(valeur)` ;
 * - autre variante : `otherwise(variante)` s'il existe, sinon la variante telle quelle.
 *
 * ```go
 * var out Union2[EitherFail, []float64]
 * if in.Tag == 0 {
 *     out = Union2[…]{Tag: 0, V0: in.V0}           // Fail : inchangé (ou otherwise)
 * } else {
 *     out = Union2[…]{Tag: 1, V1: f(in.V1.Value)}  // Success : f(valeur)
 * }
 * ```
 *
 * `input` n'est pas une union : une seule branche, sans test ni variable.
 */
function applyWhen(
	{
		node,
		input,
		inputType,
		outputType,
		right,
		otherwise,
	}: ApplyWhenParams,
	context: BuildContext,
) {
	const boundInput = bindOnce(input, context);
	const unionType = getUnionType(inputType);

	const variants: readonly Variant[] = unionType
		? DArray.map(
			unionType.typeArguments,
			(type, { index }) => ({
				type,
				access: createUnionVariantAccess(boundInput.result, index),
				tagTest: createUnionTagTest(boundInput.result, index),
			}),
		)
		: [
			{
				type: inputType,
				access: boundInput.result,
			},
		];

	const convertedValues = DArray.map(
		variants,
		(variant) => {
			if (isRightVariantType(variant.type)) {
				return convertToType(
					{
						node,
						expression: createFunctionValueCall(
							right.callee,
							[
								GoAST.createSelectorExpression({
									target: variant.access,
									identifier: valueFieldIdentifier,
								}),
							],
							right.parameterCount,
						),
						sourceType: right.returnType,
						targetType: outputType,
					},
					context,
				);
			}

			if (!otherwise) {
				return convertToType(
					{
						node,
						expression: variant.access,
						sourceType: variant.type,
						targetType: outputType,
					},
					context,
				);
			}

			const argument = convertToType(
				{
					node,
					expression: variant.access,
					sourceType: variant.type,
					targetType: otherwise.parameterType,
				},
				context,
			);

			if (DEither.isLeft(argument)) {
				return argument;
			}

			return convertToType(
				{
					node,
					expression: createFunctionValueCall(
						otherwise.callee,
						[DEither.unwrapRight(argument)],
						otherwise.parameterCount,
					),
					sourceType: otherwise.returnType,
					targetType: outputType,
				},
				context,
			);
		},
	);

	const failedValue = DArray.find(convertedValues, DEither.isLeft);

	if (failedValue) {
		return failedValue;
	}

	const branches = DCommon.pipe(
		convertedValues,
		DArray.filter(DEither.isRight),
		DArray.map((value, { index }) => ({
			tagTest: DArray.at(variants, index)?.tagTest,
			value: DEither.unwrapRight(value),
		})),
	);

	const hasRightVariant = DArray.some(variants, ({ type }) => isRightVariantType(type));
	const hasOtherVariant = DArray.some(variants, ({ type }) => !isRightVariantType(type));

	const before = DArray.concat(
		boundInput.before,
		hasRightVariant ? [] : [markUsed(right)],
		otherwise && !hasOtherVariant ? [markUsed(otherwise)] : [],
	);

	const [firstBranch] = branches;

	if (firstBranch && DArray.lengthEqual(branches, 1)) {
		return DEither.right("when-applied", {
			before,
			result: firstBranch.value,
		});
	}

	const output = context.generateIdentifier();

	const assignOutput = (value: GoAST.Expression) => GoAST.createBlockStatement({
		statements: [
			GoAST.createAssignmentStatement({
				targets: DCommon.cast([output]),
				values: DCommon.cast([value]),
			}),
		],
	});

	// `if Tag == 0 {…} else if Tag == 1 {…} else {…}`, construit depuis la dernière branche.
	const lastBranch = DArray.last(branches);

	const chain = DArray.reduceRight(
		DArray.slice(branches, 0, -1),
		DArray.reduceFrom<GoAST.BlockStatement | GoAST.IfStatement | undefined>(
			lastBranch && assignOutput(lastBranch.value),
		),
		({ element, lastValue, next }) => next(
			GoAST.createIfStatement({
				condition: element.tagTest ?? GoAST.createBooleanLiteral({ value: true }),
				body: assignOutput(element.value),
				elseBranch: lastValue,
			}),
		),
	);

	if (!chain || !DModeling.hasTagValue(chain, "[node][statement]if")) {
		return context.error(node, "un-support-when-empty-union");
	}

	return DEither.right("when-applied", {
		before: DArray.concat(
			before,
			[
				GoAST.createVariableDeclarationZeroValue({
					identifier: output,
					typeReference: outputType,
				}),
				chain,
			],
		),
		result: output,
	});
}

/**
 * `DEither.whenIsRight` (`functionCount` 1) et `DEither.whenIsRightOtherwise` (2).
 *
 * Deux formes :
 * - directe `when(input, f…)` : la valeur ;
 * - curryfiée `when(f…)` (pour `pipe`, `DArray.map`) : une closure Go dont les types
 *   viennent du type instancié que le checker donne à l'appel.
 *
 * Dans les deux cas, les fonctions sont évaluées une fois, avant tout appel, comme en JS.
 */
async function whenExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
	name: string,
	functionCount: 1 | 2,
) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, `un-support-${name}-as-value`);
	}

	const isCurried = DArray.lengthEqual(node.arguments, functionCount);

	if (!isCurried && !DArray.lengthEqual(node.arguments, functionCount + 1)) {
		return context.error(node, `un-support-${name}-arguments`);
	}

	const offset = isCurried ? 0 : 1;
	const inputNode = isCurried ? undefined : DArray.first(node.arguments);

	const input = inputNode && await DCommon.asyncPipe(
		context.transform(inputNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (input && DEither.isLeft(input)) {
		return input;
	}

	const functions = await DCommon.asyncPipe(
		DArray.slice(node.arguments, offset),
		DArray.map((functionNode, { index }) => prepareFunction(node, functionNode, index + offset, context)),
		DCommon.promiseAll,
	);

	const failedFunction = DArray.find(functions, DEither.isLeft);

	if (failedFunction) {
		return failedFunction;
	}

	const [right, otherwise] = DArray.map(
		DArray.filter(functions, DEither.isRight),
		DEither.unwrapRight,
	);

	if (!right) {
		return context.error(node, `un-support-${name}-arguments`);
	}

	const functionsBefore = DArray.concat(right.before, otherwise?.before ?? []);

	if (!input || !inputNode) {
		const curried = await createCurriedFunction(
			node,
			context,
			(curriedInput, inputType, outputType) => applyWhen(
				{
					node,
					input: curriedInput,
					inputType,
					outputType,
					right,
					otherwise,
				},
				context,
			),
		);

		if (DEither.isLeft(curried)) {
			return curried;
		}

		return context.success({
			before: functionsBefore,
			result: DEither.unwrapRight(curried),
		});
	}

	const { typeChecker } = context.transpilation;

	const inputType = await transformCheckerType(await typeChecker.getTypeAtLocation(inputNode), inputNode, context);

	if (DEither.isLeft(inputType)) {
		return inputType;
	}

	const outputType = await transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const applied = applyWhen(
		{
			node,
			input: input.result,
			inputType: DEither.unwrapRight(inputType),
			outputType: DEither.unwrapRight(outputType),
			right,
			otherwise,
		},
		context,
	);

	if (DEither.isLeft(applied)) {
		return applied;
	}

	const { before, result } = DEither.unwrapRight(applied);

	return context.success({
		before: DArray.concat(input.before, functionsBefore, before),
		result,
	});
}

/**
 * `DEither.whenIsRight(input, f)` : si `input` est un Right, `f(valeur)`, sinon `input`
 * inchangé.
 */
export function whenIsRightExpressionHandler(node: TsAST.Node, context: BuildContext) {
	return whenExpressionHandler(node, context, "whenIsRight", 1);
}

/**
 * `DEither.whenIsRightOtherwise(input, f, otherwise)` : si `input` est un Right,
 * `f(valeur)`, sinon `otherwise(input)` (un Left ou une valeur qui n'est pas un Either).
 */
export function whenIsRightOtherwiseExpressionHandler(node: TsAST.Node, context: BuildContext) {
	return whenExpressionHandler(node, context, "whenIsRightOtherwise", 2);
}
