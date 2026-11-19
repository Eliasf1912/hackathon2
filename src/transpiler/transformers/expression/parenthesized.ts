import { type GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";

/**
 * `(x)` → `x` : l'arbre Go garde déjà l'ordre des opérations.
 */
export const parenthesizedExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	(node, context) => {
		if (!TsAST.isParenthesizedExpression(node)) {
			return context.notSupport();
		}

		return context.transform(node.expression, expressionTransformers.value);
	},
);
