import { type GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";

/**
 * `await x` → `x`. Modèle synchrone bloquant (voir `type/promise.ts`) : la valeur
 * est déjà disponible quand l'expression qui la produit se termine.
 */
export const awaitExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	(node, context) => {
		if (!TsAST.isAwaitExpression(node)) {
			return context.notSupport();
		}

		return context.transform(node.expression, expressionTransformers.value);
	},
);
