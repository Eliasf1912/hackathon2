import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";

export const anyTypeTransformer: Transformer<GoAST.BuiltinTypeReference<"any">> = createTransformer(
	(node, context) => {
		if (
			node.kind !== TsAST.SyntaxKind.AnyKeyword
			&& node.kind !== TsAST.SyntaxKind.UnknownKeyword
		) {
			return context.notSupport();
		}

		return context.success({
			result: GoAST.builtinTypeReferences.any,
		});
	},
);
