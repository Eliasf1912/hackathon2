import { TsAST } from "@typescript";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { typeTransformers } from "./index";

export const parenthesizedTypeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	async(node, context) => {
		if (!TsAST.isParenthesizedTypeNode(node)) {
			return context.notSupport();
		}

		return context.transform(node.type, typeTransformers.value);
	},
);
