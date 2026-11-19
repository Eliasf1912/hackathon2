import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { bindOnce } from "../../shared";
import { createUnionTagTest, getUnionType, transformCheckerType } from "../../type/union";
import { isRightMethodIdentifier, isRightVariantType } from "./sharedDependency";

/**
 * Indexes des variantes Right d'une union Go.
 */
export function getRightVariantIndexes(unionType: GoAST.GenericTypeReference) {
	return DCommon.pipe(
		unionType.typeArguments,
		DArray.map((member, { index }) => ({
			member,
			index,
		})),
		DArray.filter(({ member }) => isRightVariantType(member)),
		DArray.map(({ index }) => index),
	);
}

export { bindOnce } from "../../shared";

/**
 * `DEither.isRight(x)`.
 *
 * - `x` est une union (`UnionN`) : test du `Tag` sur les variantes Right,
 *   `x.Tag == 1 || x.Tag == 3`. Aucune variante Right : `false`.
 * - `x` est une variante seule : `x.IsRight()`, méthode déclarée sur chaque variante.
 *
 * Limite connue : `isRight` utilisé comme valeur (`DArray.filter(list, DEither.isRight)`)
 * n'est pas encore pris en charge.
 */
export async function isRightExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-isRight-as-value");
	}

	const input = DArray.first(node.arguments);

	if (!input || !DArray.lengthEqual(node.arguments, 1)) {
		return context.error(node, "un-support-isRight-arguments");
	}

	const either = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(either)) {
		return either;
	}

	const inputType = await transformCheckerType(
		await context.transpilation.typeChecker.getTypeAtLocation(input),
		input,
		context,
	);

	if (DEither.isLeft(inputType)) {
		return inputType;
	}

	const unionType = getUnionType(DEither.unwrapRight(inputType));

	if (!unionType) {
		return context.success({
			before: either.before,
			result: GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: either.result,
					identifier: isRightMethodIdentifier,
				}),
				arguments: [],
			}),
		});
	}

	const bound = bindOnce(either.result, context);

	const condition = DArray.reduce(
		getRightVariantIndexes(unionType),
		DArray.reduceFrom<GoAST.Expression | undefined>(undefined),
		({ element, lastValue, next }) => {
			const test = createUnionTagTest(bound.result, element);

			return next(
				lastValue
					? GoAST.createBinaryExpression({
						operator: "||",
						left: lastValue,
						right: test,
					})
					: test,
			);
		},
	);

	if (!condition) {
		return context.success({
			before: DArray.concat(
				either.before,
				[
					GoAST.createAssignmentStatement({
						targets: DCommon.cast([GoAST.createIdentifier("_")]),
						values: DCommon.cast([either.result]),
					}),
				],
			),
			result: GoAST.createBooleanLiteral({ value: false }),
		});
	}

	return context.success({
		before: DArray.concat(either.before, bound.before),
		result: condition,
	});
}
