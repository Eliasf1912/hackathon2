import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { expressionTransformers } from ".";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";

export const conditionalExpressionTransformer: Transformer<GoAST.CallExpression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isConditionalExpression(node)) {
			return context.notSupport();
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

		const iife = GoAST.createFunctionLiteral({
			arguments: [],
			returnTypes: [GoAST.builtinTypeReferences.any],
			body: GoAST.createBlockStatement({
				statements: [
					...condition.before,
					GoAST.createIfStatement({
						condition: condition.result,
						body: GoAST.createBlockStatement({
							statements: [
								...whenTrue.before,
								GoAST.createReturnStatement({
									values: [whenTrue.result],
								}),
							],
						}),
					}),
					...whenFalse.before,
					GoAST.createReturnStatement({
						values: [whenFalse.result],
					}),
				],
			}),
		});

		return context.success({
			result: GoAST.createCallExpression({
				callee: iife,
				arguments: [],
			}),
		});
	},
);

