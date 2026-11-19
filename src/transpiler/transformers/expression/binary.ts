import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { expressionTransformers } from ".";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import { type BuildContext } from "../../context/build";

const binaryOperators: Partial<
	Record<TsAST.SyntaxKind, GoAST.BinaryOperator>
> = {
	[TsAST.SyntaxKind.PlusToken]: "+",
	[TsAST.SyntaxKind.MinusToken]: "-",
	[TsAST.SyntaxKind.AsteriskToken]: "*",
	[TsAST.SyntaxKind.SlashToken]: "/",
	[TsAST.SyntaxKind.PercentToken]: "%",

	[TsAST.SyntaxKind.AmpersandToken]: "&",
	[TsAST.SyntaxKind.BarToken]: "|",
	[TsAST.SyntaxKind.CaretToken]: "^",
	[TsAST.SyntaxKind.LessThanLessThanToken]: "<<",
	[TsAST.SyntaxKind.GreaterThanGreaterThanToken]: ">>",

	[TsAST.SyntaxKind.AmpersandAmpersandToken]: "&&",
	[TsAST.SyntaxKind.BarBarToken]: "||",

	[TsAST.SyntaxKind.EqualsEqualsEqualsToken]: "==",
	[TsAST.SyntaxKind.ExclamationEqualsEqualsToken]: "!=",
	[TsAST.SyntaxKind.LessThanToken]: "<",
	[TsAST.SyntaxKind.LessThanEqualsToken]: "<=",
	[TsAST.SyntaxKind.GreaterThanToken]: ">",
	[TsAST.SyntaxKind.GreaterThanEqualsToken]: ">=",
};

/**
 * `&&` et `||` court-circuitent : l'opérande droit n'est évalué que si l'opérande gauche
 * ne suffit pas à décider. Ses calculs préalables (`before`) ne peuvent donc pas être
 * placés avant l'opération : ils vont dans une branche Go conditionnelle.
 *
 * Sans calcul préalable, l'opérande droit reste dans l'expression Go, qui court-circuite
 * elle aussi.
 */
interface LogicalExpressionParams {
	node: TsAST.BinaryExpression;
	operator: "&&" | "||";
	leftBefore: readonly GoAST.Statement[];
	leftAssignment: GoAST.ShortVariableDeclarationStatement;
}

async function logicalExpressionHandler(
	{ node, operator, leftBefore, leftAssignment }: LogicalExpressionParams,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.BinaryExpression | GoAST.Identifier>["transformer"]>> {
	const right = await DCommon.asyncPipe(
		context.transform(node.right, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(right)) {
		return right;
	}

	if (DArray.lengthEqual(right.before, 0)) {
		return context.success({
			before: DArray.concat(leftBefore, [leftAssignment]),
			result: GoAST.createBinaryExpression({
				operator,
				left: leftAssignment.identifier,
				right: right.result,
			}),
		});
	}

	// Le résultat vaut l'opérande gauche, sauf si l'opérande droit doit être évalué.
	const resultDeclaration = GoAST.createShortVariableDeclarationStatement({
		identifier: context.generateIdentifier(),
		initializer: leftAssignment.identifier,
	});

	// && : évaluer la droite seulement si la gauche est vraie.
	// || : évaluer la droite seulement si la gauche est fausse.
	const condition = operator === "&&"
		? leftAssignment.identifier
		: GoAST.createUnaryExpression({
			operator: "!",
			operand: leftAssignment.identifier,
		});

	const rightBranch = GoAST.createIfStatement({
		condition,
		body: GoAST.createBlockStatement({
			statements: DArray.concat(
				right.before,
				[
					GoAST.createAssignmentStatement({
						targets: DCommon.cast([resultDeclaration.identifier]),
						values: DCommon.cast([right.result]),
					}),
				],
			),
		}),
	});

	return context.success({
		before: DArray.concat(
			leftBefore,
			[leftAssignment, resultDeclaration, rightBranch],
		),
		result: resultDeclaration.identifier,
	});
}

// Un seul objet : `file.imports` est un `Set`, l'import n'est ajouté qu'une fois.
const mathImport = GoAST.createImportDeclaration({ path: "math" });

export const binaryExpressionTransformer: Transformer<
	GoAST.BinaryExpression | GoAST.Identifier | GoAST.CallExpression
> = createTransformer(
	async(node, context) => {
		if (!TsAST.isBinaryExpression(node)) {
			return context.notSupport();
		}

		const operator = binaryOperators[node.operatorToken.kind];

		if (!operator) {
			return context.notSupport();
		}

		const left = await DCommon.asyncPipe(
			context.transform(node.left, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(left)) {
			return left;
		}

		const leftAssignment = GoAST.createShortVariableDeclarationStatement({
			identifier: context.generateIdentifier(),
			initializer: left.result,
		});

		if (operator === "&&" || operator === "||") {
			return logicalExpressionHandler(
				{
					node,
					operator,
					leftBefore: left.before,
					leftAssignment,
				},
				context,
			);
		}

		const right = await DCommon.asyncPipe(
			context.transform(node.right, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(right)) {
			return right;
		}

		const rightAssignment = GoAST.createShortVariableDeclarationStatement({
			identifier: context.generateIdentifier(),
			initializer: right.result,
		});

		const before = DArray.concat(
			left.before,
			[leftAssignment],
			right.before,
			[rightAssignment],
		);

		// Go n'a pas de `%` sur les flottants ; `math.Mod` garde le signe du dividende, comme JS.
		if (operator === "%") {
			context.file.imports.add(mathImport);

			return context.success({
				before,
				result: GoAST.createCallExpression({
					callee: GoAST.createSelectorExpression({
						target: GoAST.createIdentifier("math"),
						identifier: GoAST.createIdentifier("Mod"),
					}),
					arguments: [leftAssignment.identifier, rightAssignment.identifier],
				}),
			});
		}

		return context.success({
			before,
			result: GoAST.createBinaryExpression({
				operator,
				right: rightAssignment.identifier,
				left: leftAssignment.identifier,
			}),
		});
	},
);
