import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";

export const promiseTypeTransformer: Transformer<GoAST.BuiltinTypeReference<"any">> = createTransformer(
	(node, context) => {
		if (
			!TsAST.isTypeReferenceNode(node)
			|| !TsAST.isIdentifier(node.typeName)
			|| node.typeName.text !== "Promise"
		) {
			return context.notSupport();
		}

		return context.success({
			result: GoAST.builtinTypeReferences.any,
		});
	},
);

