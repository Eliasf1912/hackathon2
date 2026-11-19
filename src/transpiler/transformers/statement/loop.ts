import { TsAST } from "@typescript";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";

export const loopStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	(node, context) => {
		if (
			!TsAST.isForOfStatement(node)
			&& !TsAST.isForStatement(node)
			&& !TsAST.isWhileStatement(node)
		) {
			return context.notSupport();
		}

		return context.error(
			node,
			"forbidden-imperative-loop-use-darray-map-or-reduce",
		);
	},
);

