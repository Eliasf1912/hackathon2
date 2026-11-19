import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { expressionTransformers } from ".";

/**
 * Opérateurs unaires préfixes dont le sens est le même en Go : `-nombre`, `!booléen`
 * (TS garantit le type de l'opérande).
 *
 * Limite connue : `+x` (conversion en nombre), `~x`, `++x` / `--x` ne sont pas encore
 * pris en charge.
 */
const prefixOperators: Partial<Record<TsAST.SyntaxKind, GoAST.UnaryOperator>> = {
	[TsAST.SyntaxKind.MinusToken]: "-",
	[TsAST.SyntaxKind.ExclamationToken]: "!",
};

export const prefixUnaryExpressionTransformer: Transformer<GoAST.UnaryExpression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isPrefixUnaryExpression(node)) {
			return context.notSupport();
		}

		const operator = prefixOperators[node.operator];

		if (!operator) {
			return context.error(node, "un-support-prefix-operator");
		}

		const operand = await DCommon.asyncPipe(
			context.transform(node.operand, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(operand)) {
			return operand;
		}

		return context.success({
			before: operand.before,
			result: GoAST.createUnaryExpression({
				operator,
				operand: operand.result,
			}),
		});
	},
);
