import type { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";

export const asExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isAsExpression(node)) {
			return context.notSupport();
		}

		return context.transform(node.expression, expressionTransformers.value);
	},
);
