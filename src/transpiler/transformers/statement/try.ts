import { TsAST } from "@typescript";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";

export const tryStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	(node, context) => {
		if (!TsAST.isTryStatement(node)) {
			return context.notSupport();
		}

		return context.error(
			node,
			"forbidden-try-statement-duplojs-uses-deither-handling",
		);
	},
);

