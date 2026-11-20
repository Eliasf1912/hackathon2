import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";

/**
 * Chaîne littérale (`"texte"`, `'texte'`, `` `texte` `` sans substitution) → chaîne Go.
 * `node.text` contient la valeur déjà décodée ; le printer Go se charge de l'échappement.
 */
export const stringLiteralTransformer: Transformer<GoAST.StringLiteral> = createTransformer(
	(node, context) => {
		if (!TsAST.isStringLiteral(node) && !TsAST.isNoSubstitutionTemplateLiteral(node)) {
			return context.notSupport();
		}

		return context.success({
			result: GoAST.createStringLiteral({ value: node.text }),
		});
	},
);

/**
 * `true` / `false` → booléen Go.
 */
export const booleanLiteralTransformer: Transformer<GoAST.BooleanLiteral> = createTransformer(
	(node, context) => {
		if (node.kind !== TsAST.SyntaxKind.TrueKeyword && node.kind !== TsAST.SyntaxKind.FalseKeyword) {
			return context.notSupport();
		}

		return context.success({
			result: GoAST.createBooleanLiteral({ value: node.kind === TsAST.SyntaxKind.TrueKeyword }),
		});
	},
);
