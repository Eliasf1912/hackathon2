import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { expressionTransformers } from ".";
import { type BuildContext } from "../../context/build";
import { importStandardPackage } from "../shared";

/**
 * Opérateurs unaires préfixes dont le sens est le même en Go : `-nombre`, `!booléen`
 * (TS garantit le type de l'opérande).
 *
 * Limite connue : `+x` (conversion en nombre), `~x`, `++x` / `--x` ne sont pas encore
 * pris en charge.
 */
const prefixOperators: Partial<Record<TsAST.SyntaxKind, GoAST.UnaryOperator>> = {
	[TsAST.SyntaxKind.MinusToken]: "-",
	[TsAST.SyntaxKind.ExclamationToken]: "!",
};

function skipParentheses(node: TsAST.Expression): TsAST.Expression {
	return TsAST.isParenthesizedExpression(node)
		? skipParentheses(node.expression)
		: node;
}

/**
 * Littéral numérique écrit dans le source (parenthèses comprises) dont le type littéral,
 * vu par le checker, est `0` : `0`, `(0)`, `0.0`, `0x0`…
 */
async function isLiteralZero(operand: TsAST.Expression, context: BuildContext) {
	const literal = skipParentheses(operand);

	if (!TsAST.isNumericLiteral(literal)) {
		return false;
	}

	const literalType = await context.transpilation.typeChecker.getTypeAtLocation(literal);

	return literalType.isNumberLiteralType() && literalType.value === 0;
}

/**
 * `-0` : en Go, `-((float64)(0))` est une expression constante, et les constantes Go
 * n'ont pas de zéro négatif (le compilateur la replie en `+0`). `math.Copysign(0, -1)`
 * est évalué à l'exécution et donne `-0`, comme JS.
 *
 * Seul un littéral est concerné : une variable (`-zero`) ou un appel est évalué à
 * l'exécution, et `-(-0)` donne bien `+0` (l'opérande n'est pas un littéral).
 */
function createNegativeZero(context: BuildContext) {
	return GoAST.createCallExpression({
		callee: GoAST.createSelectorExpression({
			target: importStandardPackage("math", context),
			identifier: GoAST.createIdentifier("Copysign"),
		}),
		arguments: [
			GoAST.createIntegerLiteral({ value: 0n }),
			GoAST.createUnaryExpression({
				operator: "-",
				operand: GoAST.createIntegerLiteral({ value: 1n }),
			}),
		],
	});
}

export const prefixUnaryExpressionTransformer: Transformer<
	GoAST.UnaryExpression | GoAST.CallExpression
> = createTransformer(
	async(node, context) => {
		if (!TsAST.isPrefixUnaryExpression(node)) {
			return context.notSupport();
		}

		const operator = prefixOperators[node.operator];

		if (!operator) {
			return context.error(node, "un-support-prefix-operator");
		}

		if (operator === "-" && await isLiteralZero(node.operand, context)) {
			return context.success({ result: createNegativeZero(context) });
		}

		const operand = await DCommon.asyncPipe(
			context.transform(node.operand, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(operand)) {
			return operand;
		}

		return context.success({
			before: operand.before,
			result: GoAST.createUnaryExpression({
				operator,
				operand: operand.result,
			}),
		});
	},
);
