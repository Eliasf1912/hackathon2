import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { expressionTransformers } from "../expression";
import { transformFunctionReturnType } from "../declaration/function";
import { convertExpressionToType } from "../type/union";

function findEnclosingFunction(node: TsAST.Node): TsAST.FunctionLikeDeclaration | undefined {
	const { parent } = node;

	if (!parent) {
		return undefined;
	}

	return TsAST.isFunctionLikeDeclaration(parent)
		? parent
		: findEnclosingFunction(parent);
}

/**
 * `return valeur` : la valeur est convertie vers le type de retour de la fonction
 * (un membre renvoyé là où la fonction annonce une union).
 */
export const returnStatementTransformer: Transformer<GoAST.ReturnStatement> = createTransformer(
	async(node, context) => {
		if (!TsAST.isReturnStatement(node) || !node.expression) {
			return context.notSupport();
		}

		const functionNode = findEnclosingFunction(node);

		if (!functionNode) {
			return context.error(node, "un-support-return-outside-function");
		}

		const returnType = await transformFunctionReturnType(functionNode, context);

		if (DEither.isLeft(returnType)) {
			return returnType;
		}

		const expression = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(expression)) {
			return expression;
		}

		const value = await convertExpressionToType(
			{
				node: node.expression,
				expression: expression.result,
				targetType: DEither.unwrapRight(returnType),
			},
			context,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		return context.success({
			before: expression.before,
			result: GoAST.createReturnStatement({
				values: [DEither.unwrapRight(value)],
			}),
		});
	},
);
