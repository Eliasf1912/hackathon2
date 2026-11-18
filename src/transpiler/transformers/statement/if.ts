import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TypeFlags } from "typescript/async";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../context/build";
import { expressionTransformers } from "../expression";
import { statementTransformers } from ".";
import { blockStatementTransformer } from "./block";

/**
 * Une branche de `if` / `else`. Go exige un bloc : une branche qui n'est pas un bloc
 * (`if (a) return x;`) est enveloppée, avec ses calculs préalables.
 */
async function transformBranch(statement: TsAST.Statement, context: BuildContext) {
	if (TsAST.isBlock(statement)) {
		return DCommon.asyncPipe(
			context.transform(statement, [blockStatementTransformer]),
			DEither.unwrapRight,
		);
	}

	const branch = await DCommon.asyncPipe(
		context.transform(statement, statementTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(branch)) {
		return branch;
	}

	return {
		before: [],
		result: GoAST.createBlockStatement({
			statements: DArray.concat(branch.before, [branch.result]),
		}),
	};
}

/**
 * Traduit un `if`, et récursivement ses `else if`.
 *
 * Les calculs préalables (`before`) de la condition sont renvoyés pour être placés avant
 * le `if`. Pour un `else if`, ils sont placés dans le `else` : ils ne doivent être faits
 * que si la condition précédente est fausse.
 */
async function transformIf(
	node: TsAST.IfStatement,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.IfStatement>["transformer"]>> {
	const conditionType = await context.transpilation.typeChecker.getTypeAtLocation(node.expression);

	// Go exige un `bool`. La « truthiness » JS (`if (value)` sur un nombre, une chaîne…)
	// n'est pas encore prise en charge : limite connue, signalée explicitement.
	if ((conditionType.flags & TypeFlags.BooleanLike) === 0) {
		return context.error(node.expression, "un-support-non-boolean-condition");
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

	const elseBranch = await transformElse(node.elseStatement, context);

	if (DEither.isLeft(elseBranch)) {
		return elseBranch;
	}

	return context.success({
		before: condition.before,
		result: GoAST.createIfStatement({
			condition: condition.result,
			body: body.result,
			elseBranch: DEither.unwrapRight(elseBranch),
		}),
	});
}

async function transformElse(statement: TsAST.Statement | undefined, context: BuildContext) {
	if (!statement) {
		return DEither.success(undefined);
	}

	if (!TsAST.isIfStatement(statement)) {
		const branch = await transformBranch(statement, context);

		return DEither.isLeft(branch)
			? branch
			: DEither.success(branch.result);
	}

	const elseIf = await DCommon.asyncPipe(
		transformIf(statement, context),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(elseIf)) {
		return elseIf;
	}

	// `else if` sans calcul préalable : reste un `else if` en Go.
	if (DArray.lengthEqual(elseIf.before, 0)) {
		return DEither.success(elseIf.result);
	}

	// Sinon : `else { calculs…; if … }`.
	return DEither.success(
		GoAST.createBlockStatement({
			statements: DArray.concat(elseIf.before, [elseIf.result]),
		}),
	);
}

export const ifStatementTransformer: Transformer<GoAST.IfStatement> = createTransformer(
	async(node, context) => {
		if (!TsAST.isIfStatement(node)) {
			return context.notSupport();
		}

		return transformIf(node, context);
	},
);
