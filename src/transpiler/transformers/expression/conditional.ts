import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { TypeFlags } from "typescript/async";
import { expressionTransformers } from ".";
import { type BuildContext } from "../../context/build";
import { convertExpressionToType, transformCheckerType, type GoType } from "../type/union";

/**
 * Une branche du ternaire : ses calculs préalables, puis l'affectation de sa valeur
 * (convertie vers le type du ternaire).
 */
async function transformBranch(
	branch: TsAST.Expression,
	output: GoAST.Identifier,
	outputType: GoType,
	context: BuildContext,
) {
	const value = await DCommon.asyncPipe(
		context.transform(branch, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(value)) {
		return value;
	}

	const converted = await convertExpressionToType(
		{
			node: branch,
			expression: value.result,
			targetType: outputType,
		},
		context,
	);

	if (DEither.isLeft(converted)) {
		return converted;
	}

	return DEither.right(
		"conditional-branch",
		GoAST.createBlockStatement({
			statements: DArray.concat(
				value.before,
				[
					GoAST.createAssignmentStatement({
						targets: DCommon.cast([output]),
						values: DCommon.cast([DEither.unwrapRight(converted)]),
					}),
				],
			),
		}),
	);
}

/**
 * `condition ? a : b`. Go n'a pas de ternaire : une variable du type que le checker donne
 * au ternaire, remplie dans un `if`. Les calculs préalables de chaque branche restent
 * dans sa branche (seule la branche choisie est évaluée, comme en JS).
 *
 * ```go
 * var out T
 * if condition { out = a } else { out = b }
 * ```
 */
export const conditionalExpressionTransformer: Transformer<GoAST.Identifier> = createTransformer(
	async(node, context) => {
		if (!TsAST.isConditionalExpression(node)) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;
		const conditionType = await typeChecker.getTypeAtLocation(node.condition);

		// Même règle que `if` : la « truthiness » JS n'est pas prise en charge.
		if ((conditionType.flags & TypeFlags.BooleanLike) === 0) {
			return context.error(node.condition, "un-support-non-boolean-condition");
		}

		const condition = await DCommon.asyncPipe(
			context.transform(node.condition, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(condition)) {
			return condition;
		}

		const outputType = await transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context);

		if (DEither.isLeft(outputType)) {
			return outputType;
		}

		const output = context.generateIdentifier();

		const whenTrue = await transformBranch(node.whenTrue, output, DEither.unwrapRight(outputType), context);

		if (DEither.isLeft(whenTrue)) {
			return whenTrue;
		}

		const whenFalse = await transformBranch(node.whenFalse, output, DEither.unwrapRight(outputType), context);

		if (DEither.isLeft(whenFalse)) {
			return whenFalse;
		}

		return context.success({
			before: DArray.concat(
				condition.before,
				[
					GoAST.createVariableDeclarationZeroValue({
						identifier: output,
						typeReference: DEither.unwrapRight(outputType),
					}),
					GoAST.createIfStatement({
						condition: condition.result,
						body: DEither.unwrapRight(whenTrue),
						elseBranch: DEither.unwrapRight(whenFalse),
					}),
				],
			),
			result: output,
		});
	},
);
