import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import { bindOnce } from "../shared";
import { convertExpressionToType, convertToType, getUnionType, goTypeKey, transformCheckerType } from "../type/union";

/**
 * `a ?? b` : `b` (évalué seulement dans ce cas) si `a` vaut `undefined` ou `null`, sinon
 * `a` (sans `undefined` / `null`), dans une variable du type que le checker donne au tout.
 *
 * ```go
 * var out T
 * if a.Tag == 0 { out = b } else { out = a.V1 }
 * ```
 *
 * `a` qui ne peut pas valoir `undefined` / `null` : `a`, et `b` n'est pas évalué.
 */
export const nullishCoalescingTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isBinaryExpression(node) || node.operatorToken.kind !== TsAST.SyntaxKind.QuestionQuestionToken) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;

		const [leftType, outputType] = await Promise.all([
			transformCheckerType(await typeChecker.getTypeAtLocation(node.left), node.left, context),
			transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context),
		]);

		if (DEither.isLeft(leftType)) {
			return leftType;
		}

		if (DEither.isLeft(outputType)) {
			return outputType;
		}

		const left = await DCommon.asyncPipe(
			context.transform(node.left, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(left)) {
			return left;
		}

		const leftUnion = getUnionType(DEither.unwrapRight(leftType));
		const nullishIndexes = leftUnion
			? DArray.filter(
				DArray.map(leftUnion.typeArguments, (member, { index }) => ({
					key: goTypeKey(member),
					index,
				})),
				({ key }) => key.endsWith(".JSUndefined") || key.endsWith(".JSNull"),
			)
			: [];

		if (!leftUnion || DArray.lengthEqual(nullishIndexes, 0)) {
			return context.success(left);
		}

		const bound = bindOnce(left.result, context);
		const output = context.generateIdentifier();

		const right = await DCommon.asyncPipe(
			context.transform(node.right, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(right)) {
			return right;
		}

		const rightValue = await convertExpressionToType(
			{
				node: node.right,
				expression: right.result,
				targetType: DEither.unwrapRight(outputType),
			},
			context,
		);

		if (DEither.isLeft(rightValue)) {
			return rightValue;
		}

		// `a` sans ses variantes `undefined` / `null` : TS sait qu'elles sont exclues ici.
		const leftValue = convertToType(
			{
				node,
				expression: bound.result,
				sourceType: leftUnion,
				targetType: DEither.unwrapRight(outputType),
			},
			context,
		);

		if (DEither.isLeft(leftValue)) {
			return leftValue;
		}

		const isNullish = DArray.reduce(
			nullishIndexes,
			DArray.reduceFrom<GoAST.Expression | undefined>(undefined),
			({ element, lastValue, next }) => {
				const test = GoAST.createBinaryExpression({
					operator: "==",
					left: GoAST.createSelectorExpression({
						target: bound.result,
						identifier: GoAST.createIdentifier("Tag"),
					}),
					right: GoAST.createIntegerLiteral({ value: BigInt(element.index) }),
				});

				return next(lastValue
					? GoAST.createBinaryExpression({
						operator: "||",
						left: lastValue,
						right: test,
					})
					: test);
			},
		);

		const assign = (value: GoAST.Expression) => GoAST.createAssignmentStatement({
			targets: DCommon.cast([output]),
			values: DCommon.cast([value]),
		});

		return context.success({
			before: DArray.concat(
				left.before,
				bound.before,
				[
					GoAST.createVariableDeclarationZeroValue({
						identifier: output,
						typeReference: DEither.unwrapRight(outputType),
					}),
					GoAST.createIfStatement({
						condition: isNullish ?? GoAST.createBooleanLiteral({ value: false }),
						body: GoAST.createBlockStatement({
							statements: DArray.concat(right.before, [assign(DEither.unwrapRight(rightValue))]),
						}),
						elseBranch: GoAST.createBlockStatement({
							statements: [assign(DEither.unwrapRight(leftValue))],
						}),
					}),
				],
			),
			result: output,
		});
	},
);
