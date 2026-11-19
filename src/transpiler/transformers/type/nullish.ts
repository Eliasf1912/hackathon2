import { type GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { createNullishReference } from "../expression/nullish";

/**
 * Types `null` et `undefined` → `shard_dependencies.JSNull` / `JSUndefined`.
 */
export const nullishTypeTransformer: Transformer<GoAST.PackageTypeReference> = createTransformer(
	(node, context) => {
		if (node.kind === TsAST.SyntaxKind.UndefinedKeyword) {
			return context.success({ result: createNullishReference("undefined", context) });
		}

		if (TsAST.isLiteralTypeNode(node) && node.literal.kind === TsAST.SyntaxKind.NullKeyword) {
			return context.success({ result: createNullishReference("null", context) });
		}

		return context.notSupport();
	},
);
