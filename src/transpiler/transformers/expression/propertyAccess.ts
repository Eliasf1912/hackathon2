import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";

export const propertyAccessExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isPropertyAccessExpression(node)) {
			return context.notSupport();
		}

		const targetResult = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(targetResult)) {
			return targetResult;
		}

		const propertyName = node.name.text;

		if (propertyName === "length") {
			return context.success({
				before: targetResult.before,
				result: GoAST.createCallExpression({
					callee: GoAST.createIdentifier("len"),
					arguments: [targetResult.result],
				}),
			});
		}

		return context.success({
			before: targetResult.before,
			result: GoAST.createIndexExpression({
				target: targetResult.result,
				index: GoAST.createStringLiteral({ value: propertyName }),
			}),
		});
	},
);

