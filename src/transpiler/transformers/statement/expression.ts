import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from "../expression";

/**
 * Expression utilisée comme instruction (`await repository.save(x);`) : un appel devient
 * l'instruction elle-même, toute autre valeur est seulement évaluée (`_ = valeur`).
 */
export const expressionStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	async(node, context) => {
		if (!TsAST.isExpressionStatement(node)) {
			return context.notSupport();
		}

		const value = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		const { result } = value;

		return context.success({
			before: value.before,
			result: DModeling.hasTagValue(result, "[node][expression][statement]call")
				? result
				: GoAST.createAssignmentStatement({
					targets: DCommon.cast([GoAST.createIdentifier("_")]),
					values: DCommon.cast([result]),
				}),
		});
	},
);
