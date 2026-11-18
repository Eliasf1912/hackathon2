import { GoAST } from "@go";
import { type Type } from "typescript/async";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import {
	convertToType,
	createUnionTagTest,
	createUnionVariantAccess,
	getUnionType,
	transformCheckerType,
	type GoType,
} from "../../type/union";
import { bindOnce } from "./isRight";
import { isRightVariantType, valueFieldIdentifier } from "./sharedDependency";

interface Variant {
	type: GoType;
	access: GoAST.Expression;
	tagTest?: GoAST.Expression;
}

interface ApplyWhenIsRightParams {
	node: TsAST.Node;
	input: GoAST.Expression;
	inputType: GoType;
	theFunction: GoAST.Expression;
	functionReturnType: GoType;
	outputType: GoType;
}

/**
 * Transforme le résultat d'un checker en type Go, ou renvoie l'erreur.
 */
async function getGoTypes(
	types: readonly Type[],
	enclosing: TsAST.Node,
	context: BuildContext,
) {
	const goTypes = await DCommon.asyncPipe(
		types,
		DArray.map((type) => transformCheckerType(type, enclosing, context)),
		DCommon.promiseAll,
	);

	const failed = DArray.find(goTypes, DEither.isLeft);

	if (failed) {
		return failed;
	}

	return DEither.right(
		"go-types",
		DArray.map(
			DArray.filter(goTypes, DEither.isRight),
			DEither.unwrapRight,
		),
	);
}

/**
 * Type renvoyé par la fonction passée à `whenIsRight` (paramètre `index` de l'appel),
 * d'après la signature résolue, donc instanciée.
 */
async function getFunctionReturnType(node: TsAST.CallExpression, index: number, context: BuildContext) {
	const { typeChecker } = context.transpilation;

	const functionSignature = DArray.first(
		await (await typeChecker.getParameterType(await typeChecker.getResolvedSignature(node), index))
			.getCallSignatures(),
	);

	return functionSignature && typeChecker.getReturnTypeOfSignature(functionSignature);
}

/**
 * `DEither.whenIsRight` : si `input` est un Right, `theFunction(valeur)`, sinon `input`
 * inchangé. Le type TS du résultat est une union (`Fail | readonly [number]`).
 *
 * Une branche par variante de `input`, chacune convertie vers le type Go du résultat :
 *
 * ```go
 * var out Union2[EitherFail, []float64]
 * if in.Tag == 0 {
 *     out = Union2[…]{Tag: 0, V0: in.V0}           // Fail : inchangé
 * } else {
 *     out = Union2[…]{Tag: 1, V1: f(in.V1.Value)}  // Success : f(valeur)
 * }
 * ```
 *
 * `input` n'est pas une union : une seule branche, sans test ni variable.
 *
 * Deux formes :
 * - `whenIsRight(input, theFunction)` : la valeur directement ;
 * - `whenIsRight(theFunction)` (curryfiée, pour `pipe`) : une fonction Go
 *   `func(input In) Out { … }`, dont les types viennent du type instancié que le checker
 *   donne à l'appel. `theFunction` est évaluée à la création, comme en JS.
 */
export async function whenIsRightExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-whenIsRight-as-value");
	}

	if (DArray.lengthEqual(node.arguments, 1)) {
		return curriedWhenIsRight(node, context);
	}

	const [inputNode, functionNode] = node.arguments;

	if (!inputNode || !functionNode || !DArray.lengthEqual(node.arguments, 2)) {
		return context.error(node, "un-support-whenIsRight-arguments");
	}

	const { typeChecker } = context.transpilation;

	const input = await DCommon.asyncPipe(
		context.transform(inputNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(input)) {
		return input;
	}

	const theFunction = await DCommon.asyncPipe(
		context.transform(functionNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(theFunction)) {
		return theFunction;
	}

	const functionReturnType = await getFunctionReturnType(node, 1, context);

	if (!functionReturnType) {
		return context.error(functionNode, "un-support-whenIsRight-function-type");
	}

	const types = await getGoTypes(
		[
			await typeChecker.getTypeAtLocation(inputNode),
			functionReturnType,
			await typeChecker.getTypeAtLocation(node),
		],
		node,
		context,
	);

	if (DEither.isLeft(types)) {
		return types;
	}

	const [inputType, functionGoReturnType, outputType] = DEither.unwrapRight(types);

	if (!inputType || !functionGoReturnType || !outputType) {
		return context.error(node, "un-support-whenIsRight-types");
	}

	const applied = applyWhenIsRight(
		{
			node,
			input: input.result,
			inputType,
			theFunction: theFunction.result,
			functionReturnType: functionGoReturnType,
			outputType,
		},
		context,
	);

	if (DEither.isLeft(applied)) {
		return applied;
	}

	const { before, result } = DEither.unwrapRight(applied);

	return context.success({
		before: DArray.concat(input.before, theFunction.before, before),
		result,
	});
}

async function curriedWhenIsRight(node: TsAST.CallExpression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const [functionNode] = node.arguments;

	if (!functionNode) {
		return context.error(node, "un-support-whenIsRight-arguments");
	}

	const theFunction = await DCommon.asyncPipe(
		context.transform(functionNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(theFunction)) {
		return theFunction;
	}

	// `(input: In) => Out`, déjà instancié par le contexte (paramètre de `pipe`…).
	const signature = DArray.first(await (await typeChecker.getTypeAtLocation(node)).getCallSignatures());
	const functionReturnType = await getFunctionReturnType(node, 0, context);

	if (!signature || !functionReturnType) {
		return context.error(node, "un-support-whenIsRight-function-type");
	}

	const types = await getGoTypes(
		[
			await typeChecker.getParameterType(signature, 0),
			functionReturnType,
			await typeChecker.getReturnTypeOfSignature(signature),
		],
		node,
		context,
	);

	if (DEither.isLeft(types)) {
		return types;
	}

	const [inputType, functionGoReturnType, outputType] = DEither.unwrapRight(types);

	if (!inputType || !functionGoReturnType || !outputType) {
		return context.error(node, "un-support-whenIsRight-types");
	}

	// La fonction est évaluée une fois, à la création, et capturée par la closure.
	const boundFunction = bindOnce(theFunction.result, context);
	const input = context.generateIdentifier();

	const applied = applyWhenIsRight(
		{
			node,
			input,
			inputType,
			theFunction: boundFunction.result,
			functionReturnType: functionGoReturnType,
			outputType,
		},
		context,
	);

	if (DEither.isLeft(applied)) {
		return applied;
	}

	const { before, result } = DEither.unwrapRight(applied);

	return context.success({
		before: DArray.concat(theFunction.before, boundFunction.before),
		result: GoAST.createFunctionLiteral({
			arguments: [
				GoAST.createFunctionArgument({
					identifier: input,
					type: inputType,
				}),
			],
			returnTypes: [outputType],
			body: GoAST.createBlockStatement({
				statements: DArray.concat(
					before,
					[GoAST.createReturnStatement({ values: [result] })],
				),
			}),
		}),
	});
}

/**
 * Corps commun aux deux formes : `input` et `theFunction` sont déjà transformées
 * (leurs calculs préalables sont à la charge de l'appelant).
 */
function applyWhenIsRight(
	{
		node,
		input,
		inputType,
		theFunction,
		functionReturnType,
		outputType,
	}: ApplyWhenIsRightParams,
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

	const hasRightVariant = DArray.some(variants, ({ type }) => isRightVariantType(type));

	// Sans variante Right, la fonction n'est jamais appelée : évaluée seulement, comme en JS.
	const boundFunction = hasRightVariant
		? bindOnce(theFunction, context)
		: {
			before: [
				GoAST.createAssignmentStatement({
					targets: DCommon.cast([GoAST.createIdentifier("_")]),
					values: DCommon.cast([theFunction]),
				}),
			],
			result: theFunction,
		};

	const convertedValues = DArray.map(
		variants,
		(variant) => {
			const isRight = isRightVariantType(variant.type);

			return convertToType(
				{
					node,
					expression: isRight
						? GoAST.createCallExpression({
							callee: boundFunction.result,
							arguments: [
								GoAST.createSelectorExpression({
									target: variant.access,
									identifier: valueFieldIdentifier,
								}),
							],
						})
						: variant.access,
					sourceType: isRight
						? functionReturnType
						: variant.type,
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

	const before = DArray.concat(boundInput.before, boundFunction.before);

	const [firstBranch] = branches;

	if (firstBranch && DArray.lengthEqual(branches, 1)) {
		return DEither.right("when-is-right", {
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
		return context.error(node, "un-support-whenIsRight-empty-union");
	}

	return DEither.right("when-is-right", {
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
