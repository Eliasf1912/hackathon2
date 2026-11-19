import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import { TypeFlags } from "typescript/async";
import { expressionTransformers } from ".";

/**
 * `a && b` and `a || b` on booleans keep the short-circuit evaluation:
 * the right operand and its preparations only run when they are needed.
 *
 * ```go
 * result := a
 * if !result { result = b }   // a || b
 * if result { result = b }    // a && b
 * ```
 */
export const logicalExpressionTransformer: Transformer<GoAST.Identifier> = createTransformer(
	async(node, context) => {
		if (
			!TsAST.isBinaryExpression(node)
			|| (
				node.operatorToken.kind !== TsAST.SyntaxKind.AmpersandAmpersandToken
				&& node.operatorToken.kind !== TsAST.SyntaxKind.BarBarToken
			)
		) {
			return context.notSupport();
		}

		const resultType = await context.transpilation.typeChecker.getTypeAtLocation(node);

		// JavaScript truthiness on other values is not translated.
		if (!(resultType.flags & TypeFlags.BooleanLike)) {
			return context.notSupport();
		}

		const left = await DCommon.asyncPipe(
			context.transform(node.left, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(left)) {
			return left;
		}

		const right = await DCommon.asyncPipe(
			context.transform(node.right, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(right)) {
			return right;
		}

		const resultStatement = GoAST.createShortVariableDeclarationStatement({
			identifier: context.generateIdentifier(),
			initializer: left.result,
		});

		const result = resultStatement.identifier;

		const evaluateRight = GoAST.createIfStatement({
			condition: node.operatorToken.kind === TsAST.SyntaxKind.BarBarToken
				? GoAST.createUnaryExpression({
					operator: "!",
					operand: result,
				})
				: result,
			body: GoAST.createBlockStatement({
				statements: DArray.push(
					right.before,
					GoAST.createAssignmentStatement({
						targets: DCommon.cast([result]),
						values: DCommon.cast([right.result]),
					}),
				),
			}),
		});

		return context.success({
			before: DArray.concat(
				left.before,
				[resultStatement, evaluateRight],
			),
			result,
		});
	},
);
