import { GoAST } from "@go";
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

/**
 * `DEither.whenIsRight(input, theFunction)` : si `input` est un Right, `theFunction(valeur)`,
 * sinon `input` inchangé. Le type TS du résultat est une union (`Fail | readonly [number]`).
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
 * Limite connue : la forme curryfiée (`whenIsRight(theFunction)`, pour `pipe`) n'est pas
 * encore prise en charge.
 */
export async function whenIsRightExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-whenIsRight-as-value");
	}

	const [inputNode, functionNode] = node.arguments;

	if (!inputNode || !functionNode || !DArray.lengthEqual(node.arguments, 2)) {
		return context.error(node, "un-support-whenIsRight-curried");
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

	const inputType = await transformCheckerType(
		await typeChecker.getTypeAtLocation(inputNode),
		inputNode,
		context,
	);

	if (DEither.isLeft(inputType)) {
		return inputType;
	}

	const outputType = await transformCheckerType(
		await typeChecker.getTypeAtLocation(node),
		node,
		context,
	);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const functionSignature = DArray.first(
		await (await typeChecker.getParameterType(await typeChecker.getResolvedSignature(node), 1))
			.getCallSignatures(),
	);

	if (!functionSignature) {
		return context.error(functionNode, "un-support-whenIsRight-function-type");
	}

	const functionReturnType = await transformCheckerType(
		await typeChecker.getReturnTypeOfSignature(functionSignature),
		functionNode,
		context,
	);

	if (DEither.isLeft(functionReturnType)) {
		return functionReturnType;
	}

	const boundInput = bindOnce(input.result, context);
	const unionType = getUnionType(DEither.unwrapRight(inputType));

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
				type: DEither.unwrapRight(inputType),
				access: boundInput.result,
			},
		];

	const hasRightVariant = DArray.some(variants, ({ type }) => isRightVariantType(type));

	// Sans variante Right, la fonction n'est jamais appelée : évaluée seulement, comme en JS.
	const boundFunction = hasRightVariant
		? bindOnce(theFunction.result, context)
		: {
			before: [
				GoAST.createAssignmentStatement({
					targets: DCommon.cast([GoAST.createIdentifier("_")]),
					values: DCommon.cast([theFunction.result]),
				}),
			],
			result: theFunction.result,
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
						? DEither.unwrapRight(functionReturnType)
						: variant.type,
					targetType: DEither.unwrapRight(outputType),
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

	const before = DArray.concat(
		input.before,
		boundInput.before,
		theFunction.before,
		boundFunction.before,
	);

	const [firstBranch] = branches;

	if (firstBranch && DArray.lengthEqual(branches, 1)) {
		return context.success({
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

	return context.success({
		before: DArray.concat(
			before,
			[
				GoAST.createVariableDeclarationZeroValue({
					identifier: output,
					typeReference: DEither.unwrapRight(outputType),
				}),
				chain,
			],
		),
		result: output,
	});
}
