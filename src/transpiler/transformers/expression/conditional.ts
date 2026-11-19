import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import { TypeFlags } from "typescript/async";
import { useGoType } from "../../resolveGoType";
import { expressionTransformers } from ".";

/**
 * Go has no ternary operator: `condition ? whenTrue : whenFalse` becomes a
 * variable typed by the checker, assigned in the branch that is selected.
 * Only that branch and its preparations are evaluated.
 *
 * ```go
 * var result T
 * if condition { result = whenTrue } else { result = whenFalse }
 * ```
 */
export const conditionalExpressionTransformer: Transformer<GoAST.Identifier> = createTransformer(
	async(node, context) => {
		if (!TsAST.isConditionalExpression(node)) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;
		const conditionType = await typeChecker.getTypeAtLocation(node.condition);

		// Go only accepts bool conditions: JavaScript truthiness is not translated.
		if (!(conditionType.flags & TypeFlags.BooleanLike)) {
			return context.notSupport();
		}

		const resultType = await useGoType(
			await typeChecker.getTypeAtLocation(node),
			node,
			context,
		);

		if (DEither.isLeft(resultType)) {
			return resultType;
		}

		const condition = await DCommon.asyncPipe(
			context.transform(node.condition, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(condition)) {
			return condition;
		}

		const whenTrue = await DCommon.asyncPipe(
			context.transform(node.whenTrue, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(whenTrue)) {
			return whenTrue;
		}

		const whenFalse = await DCommon.asyncPipe(
			context.transform(node.whenFalse, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(whenFalse)) {
			return whenFalse;
		}

		const resultDeclaration = GoAST.createVariableDeclarationZeroValue({
			identifier: context.generateIdentifier(),
			typeReference: resultType,
		});

		const result = resultDeclaration.identifier;

		const assign = (value: GoAST.Expression) => GoAST.createAssignmentStatement({
			targets: DCommon.cast([result]),
			values: DCommon.cast([value]),
		});

		return context.success({
			before: DArray.concat(
				condition.before,
				[
					resultDeclaration,
					GoAST.createIfStatement({
						condition: condition.result,
						body: GoAST.createBlockStatement({
							statements: DArray.push(whenTrue.before, assign(whenTrue.result)),
						}),
						elseBranch: GoAST.createBlockStatement({
							statements: DArray.push(whenFalse.before, assign(whenFalse.result)),
						}),
					}),
				],
			),
			result,
		});
	},
);
