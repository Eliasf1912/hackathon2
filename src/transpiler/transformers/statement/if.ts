import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { expressionTransformers } from "../expression";
import { blockStatementTransformer } from "./block";

// Signature : On déclare un transformer qui produit un IfStatement Go
export const ifStatementTransformer: Transformer<GoAST.IfStatement> = createTransformer(
	async(node, context) => {
		// Garde-fou : vérifie que le nœud est bien un if statement
		if (!TsAST.isIfStatement(node)) {
			return context.notSupport();
		}

		// Récursion : Transformer la condition entre parenthèses
		const condition = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(condition)) {
			return condition;
		}

		// Transformer ce qui est entre les accolades
		const thenStatement = TsAST.isBlock(node.thenStatement)
			? node.thenStatement
			: TsAST.factory.createBlock([node.thenStatement]);

		const body = await DCommon.asyncPipe(
			context.transform(thenStatement, [blockStatementTransformer]),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(body)) {
			return body;
		}

		return context.success({
			before: condition.before,
			result: GoAST.createIfStatement({
				condition: condition.result,
				body: body.result,
			}),
		});
	},
);
