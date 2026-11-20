import { TsAST } from "@typescript";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";

export const throwStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	(node, context) => {
		if (!TsAST.isThrowStatement(node)) {
			return context.notSupport();
		}

		return context.error(
			node,
			"forbidden-throw-statement-duplojs-uses-deither-fail",
		);
	},
);

