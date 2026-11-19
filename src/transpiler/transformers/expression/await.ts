import { TsAST } from "@typescript";
import type { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { expressionTransformers } from ".";

/**
 * Asynchronism is translated synchronously: an async computation is already
 * finished when its value is used, so `await value` is `value`.
 */
export const awaitExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	(node, context) => {
		if (!TsAST.isAwaitExpression(node)) {
			return context.notSupport();
		}

		return context.transform(node.expression, expressionTransformers.value);
	},
);
