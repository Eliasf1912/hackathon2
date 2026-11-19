import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import * as DModeling from "@duplojs/lang/modeling";
import { TypeFlags } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { expressionTransformers } from "../expression";
import { statementTransformers } from ".";
import { blockStatementTransformer } from "./block";

async function transformBranch(
	node: TsAST.Statement,
	context: BuildContext,
) {
	if (TsAST.isBlock(node)) {
		return DCommon.asyncPipe(
			context.transform(node, [blockStatementTransformer]),
			DEither.unwrapRight,
		);
	}

	const statement = await DCommon.asyncPipe(
		context.transform(node, statementTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(statement)) {
		return statement;
	}

	return {
		before: [],
		result: GoAST.createBlockStatement({
			statements: DArray.push(statement.before, statement.result),
		}),
	};
}

export const ifStatementTransformer: Transformer<GoAST.IfStatement> = createTransformer(
	async(node, context) => {
		if (!TsAST.isIfStatement(node)) {
			return context.notSupport();
		}

		const conditionType = await context.transpilation.typeChecker.getTypeAtLocation(node.expression);

		// Go only accepts bool conditions: JavaScript truthiness is not translated.
		if (!(conditionType.flags & TypeFlags.BooleanLike)) {
			return context.notSupport();
		}

		const condition = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(condition)) {
			return condition;
		}

		const body = await transformBranch(node.thenStatement, context);

		if (DEither.isLeft(body)) {
			return body;
		}

		if (!node.elseStatement) {
			return context.success({
				before: condition.before,
				result: GoAST.createIfStatement({
					condition: condition.result,
					body: body.result,
				}),
			});
		}

		const elseStatement = await DCommon.asyncPipe(
			context.transform(node.elseStatement, statementTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(elseStatement)) {
			return elseStatement;
		}

		const elseResult = elseStatement.result;

		// `else if` stays chained only when its condition needs no preparation;
		// otherwise the preparation must run inside the else branch.
		const elseBranch = DArray.lengthEqual(elseStatement.before, 0)
			&& DModeling.hasTagValue(elseResult, ["[node][statement]if", "[node][statement]block"])
			? elseResult
			: GoAST.createBlockStatement({
				statements: DArray.push(elseStatement.before, elseResult),
			});

		return context.success({
			before: condition.before,
			result: GoAST.createIfStatement({
				condition: condition.result,
				body: body.result,
				elseBranch,
			}),
		});
	},
);
