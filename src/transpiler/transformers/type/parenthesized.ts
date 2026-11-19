import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { typeTransformers } from ".";

export const parenthesizedTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	(node, context) => {
		if (!TsAST.isParenthesizedTypeNode(node)) {
			return context.notSupport();
		}

		return context.transform(node.type, typeTransformers.value);
	},
);
