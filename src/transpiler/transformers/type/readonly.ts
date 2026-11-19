import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import { typeTransformers } from ".";

/**
 * Go has no readonly collections: `readonly T` is translated as `T`.
 * TypeScript already guarantees that the value is not mutated.
 */
export const readonlyTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	(node, context) => {
		if (
			!TsAST.isTypeOperatorNode(node)
			|| node.operator !== TsAST.SyntaxKind.ReadonlyKeyword
		) {
			return context.notSupport();
		}

		return context.transform(node.type, typeTransformers.value);
	},
);
