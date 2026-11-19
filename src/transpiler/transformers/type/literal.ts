import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";

/**
 * A TypeScript literal type (`-12`, `"success"`, `true`) only narrows the
 * values of a primitive: in Go it is that primitive type.
 */
export const literalTypeTransformer: Transformer<
	| GoAST.BuiltinTypeReference<"float64">
	| GoAST.BuiltinTypeReference<"string">
	| GoAST.BuiltinTypeReference<"bool">
> = createTransformer(
	(node, context) => {
		if (!TsAST.isLiteralTypeNode(node)) {
			return context.notSupport();
		}

		const { literal } = node;

		if (
			TsAST.isNumericLiteral(literal)
			|| (
				TsAST.isPrefixUnaryExpression(literal)
				&& TsAST.isNumericLiteral(literal.operand)
			)
		) {
			return context.success({ result: GoAST.builtinTypeReferences.float64 });
		}

		if (TsAST.isStringLiteral(literal)) {
			return context.success({ result: GoAST.builtinTypeReferences.string });
		}

		if (
			literal.kind === TsAST.SyntaxKind.TrueKeyword
			|| literal.kind === TsAST.SyntaxKind.FalseKeyword
		) {
			return context.success({ result: GoAST.builtinTypeReferences.bool });
		}

		return context.notSupport();
	},
);
