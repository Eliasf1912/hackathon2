import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { createKindCheck, resolveEitherMembers } from "../members";

/**
 * `DEither.isRight(value)` checks the Right variants given by the checker:
 * `EitherIs[EitherSuccess[float64]](value)`.
 */
export async function isRightExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	const valueNode = TsAST.isCallExpression(node) && DArray.lengthEqual(node.arguments, 1)
		? DArray.first(node.arguments)
		: undefined;

	if (!TsAST.isCallExpression(node) || !valueNode) {
		return context.notSupport();
	}

	const members = await resolveEitherMembers(
		await context.transpilation.typeChecker.getTypeAtLocation(valueNode),
		node,
		context,
	);

	if (DEither.isLeft(members)) {
		return members;
	}

	const value = await DCommon.asyncPipe(
		context.transform(valueNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(value)) {
		return value;
	}

	const valueStatement = GoAST.createShortVariableDeclarationStatement({
		identifier: context.generateIdentifier(),
		initializer: value.result,
	});

	return context.success({
		before: DArray.concat(value.before, [valueStatement]),
		result: createKindCheck(members, "right", valueStatement.identifier, context),
	});
}
