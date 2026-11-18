import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";

/**
 * Type littéral (`2`, `-1`, `"saved"`, `true`) → type Go de la valeur à l'exécution.
 *
 * DuploJS conserve souvent les types littéraux (`DEither.success(2)` est un `Success<2>`) ;
 * en Go, la valeur reste un `float64`, une `string` ou un `bool`.
 *
 * Limite connue : `null` / `undefined` comme type littéral ne sont pas encore pris en charge.
 */
export const literalTypeTransformer: Transformer<GoAST.BuiltinTypeReference<"float64" | "string" | "bool">> = createTransformer(
	(node, context) => {
		if (!TsAST.isLiteralTypeNode(node)) {
			return context.notSupport();
		}

		const { literal } = node;

		if (TsAST.isNumericLiteral(literal) || TsAST.isPrefixUnaryExpression(literal)) {
			return context.success({ result: GoAST.builtinTypeReferences.float64 });
		}

		if (TsAST.isStringLiteral(literal)) {
			return context.success({ result: GoAST.builtinTypeReferences.string });
		}

		if (literal.kind === TsAST.SyntaxKind.TrueKeyword || literal.kind === TsAST.SyntaxKind.FalseKeyword) {
			return context.success({ result: GoAST.builtinTypeReferences.bool });
		}

		return context.error(node, "un-support-literal-type");
	},
);
