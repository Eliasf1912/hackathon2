import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import { typeTransformers } from ".";

export const parenthesizedTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	(node, context) => {
		if (!TsAST.isParenthesizedTypeNode(node)) {
			return context.notSupport();
		}

		return context.transform(node.type, typeTransformers.value);
	},
);
