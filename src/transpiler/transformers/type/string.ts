import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";

/**
 * `string` et type gabarit (`` `${string}@${string}` ``) → `string` : le gabarit n'est
 * qu'une vérification faite par TS, la valeur reste une chaîne.
 */
export const stringTypeTransformer: Transformer<GoAST.BuiltinTypeReference<"string">> = createTransformer(
	(node, context) => {
		if (node.kind !== TsAST.SyntaxKind.StringKeyword && !TsAST.isTemplateLiteralTypeNode(node)) {
			return context.notSupport();
		}

		return context.success({
			result: GoAST.builtinTypeReferences.string,
		});
	},
);
