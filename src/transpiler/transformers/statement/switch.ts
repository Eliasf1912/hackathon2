import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../context/build";
import { expressionTransformers } from "../expression";
import { statementTransformers } from ".";

async function transformStatements(statements: readonly TsAST.Statement[], context: BuildContext) {
	const transformed: GoAST.Statement[] = [];

	for (const statement of statements) {
		const result = await DCommon.asyncPipe(
			context.transform(statement, statementTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(result)) {
			return result;
		}

		transformed.push(...result.before, result.result);
	}

	return DEither.right("statements", transformed as readonly GoAST.Statement[]);
}

/**
 * Corps d'un `case` JS en Go : un `break` final est retiré (Go ne continue pas au cas
 * suivant) ; un corps qui ne se termine ni par `break` ni par `return` reçoit
 * `fallthrough` (en JS, l'exécution continue au cas suivant).
 */
async function transformClauseBody(clause: TsAST.CaseOrDefaultClause, isLast: boolean, context: BuildContext) {
	const last = DArray.last(clause.statements);
	const endsWithBreak = last !== undefined && TsAST.isBreakStatement(last) && !last.label;
	const statements = await transformStatements(
		endsWithBreak ? DArray.slice(clause.statements, 0, -1) : clause.statements,
		context,
	);

	if (DEither.isLeft(statements)) {
		return statements;
	}

	const terminates = endsWithBreak
		|| (last !== undefined && (TsAST.isReturnStatement(last) || TsAST.isThrowStatement(last)));

	return DEither.right(
		"statements",
		terminates || isLast
			? DEither.unwrapRight(statements)
			: DArray.concat(DEither.unwrapRight(statements), [GoAST.createFallthroughStatement({})]),
	);
}

/**
 * `switch (valeur) { case a: … }` → `switch valeur { case a: … }`, avec la sémantique JS :
 * les `case` vides qui se suivent sont regroupés (`case a, b:`), un `break` final est
 * retiré, un passage au cas suivant devient `fallthrough`. Dans chaque cas, le
 * rétrécissement (`identifier.ts`) donne leur type aux variables discriminées.
 *
 * Limite connue : `break` ailleurs qu'en fin de cas, `case` avec un calcul préalable.
 */
export const switchStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	async(node, context) => {
		if (!TsAST.isSwitchStatement(node)) {
			return context.notSupport();
		}

		const value = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		const clauses = node.caseBlock.clauses;
		const cases: GoAST.ExpressionSwitchCase[] = [];
		let defaultCase: GoAST.DefaultCase | undefined = undefined;
		let casesBeforeDefault: GoAST.ExpressionSwitchCase[] = [];
		let pending: GoAST.Expression[] = [];

		for (const [index, clause] of clauses.entries()) {
			const isLast = index === clauses.length - 1;

			if (TsAST.isCaseClause(clause)) {
				const test = await DCommon.asyncPipe(
					context.transform(clause.expression, expressionTransformers.value),
					DEither.unwrapRight,
				);

				if (DEither.isLeft(test)) {
					return test;
				}

				if (!DArray.lengthEqual(test.before, 0)) {
					return context.error(clause, "un-support-switch-case-expression");
				}

				pending.push(test.result);

				// `case a:` vide suivi d'un autre `case` : regroupé avec lui.
				if (DArray.lengthEqual(clause.statements, 0) && !isLast) {
					continue;
				}
			}

			const body = await transformClauseBody(clause, isLast, context);

			if (DEither.isLeft(body)) {
				return body;
			}

			if (TsAST.isDefaultClause(clause)) {
				casesBeforeDefault = [...cases];
				cases.length = 0;
				defaultCase = GoAST.createDefaultCase({ statements: DEither.unwrapRight(body) });
				// `case a: default:` : `default` couvre déjà `a`.
				pending = [];
				continue;
			}

			const [first, ...rest] = pending;

			if (first) {
				cases.push(GoAST.createExpressionSwitchCase({
					expressions: DCommon.cast([first, ...rest]),
					statements: DEither.unwrapRight(body),
				}));
			}

			pending = [];
		}

		return context.success({
			before: value.before,
			result: defaultCase
				? GoAST.createExpressionSwitchStatementWithDefault({
					expression: value.result,
					casesBeforeDefault,
					defaultCase,
					casesAfterDefault: cases,
				})
				: GoAST.createExpressionSwitchStatementWithoutDefault({
					expression: value.result,
					cases,
				}),
		});
	},
);
