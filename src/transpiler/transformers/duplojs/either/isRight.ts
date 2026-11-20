import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { bindOnce } from "../../shared";
import { createUnionTagTest, getUnionType, transformCheckerType } from "../../type/union";
import { hasEitherVariantKind } from "./sharedDependency";

export { bindOnce } from "../../shared";

/**
 * `DEither.isRight(x)` / `DEither.isLeft(x)` : le genre de chaque variante est connu par
 * son type Go (registre des variantes).
 *
 * - `x` est une union (`UnionN`) : test du `Tag` sur les variantes du genre,
 *   `x.Tag == 1 || x.Tag == 3` ;
 * - sinon, ou si aucune variante n'est du genre : une constante, connue à la compilation
 *   (`x` reste évalué, comme en JS).
 *
 * Limite connue : utilisé comme valeur (`DArray.filter(list, DEither.isRight)`).
 */
async function eitherKindExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
	kind: "right" | "left",
) {
	const name = kind === "right" ? "isRight" : "isLeft";

	if (!TsAST.isCallExpression(node)) {
		return context.error(node, `un-support-${name}-as-value`);
	}

	const input = DArray.first(node.arguments);

	if (!input || !DArray.lengthEqual(node.arguments, 1)) {
		return context.error(node, `un-support-${name}-arguments`);
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

	const goInputType = DEither.unwrapRight(inputType);
	const unionType = getUnionType(goInputType);
	const bound = bindOnce(either.result, context);

	const condition = unionType && DArray.reduce(
		DArray.filter(
			DArray.map(unionType.typeArguments, (member, { index }) => ({
				member,
				index,
			})),
			({ member }) => hasEitherVariantKind(member, kind),
		),
		DArray.reduceFrom<GoAST.Expression | undefined>(undefined),
		({ element, lastValue, next }) => {
			const test = createUnionTagTest(bound.result, element.index);

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

	if (condition) {
		return context.success({
			before: DArray.concat(either.before, bound.before),
			result: condition,
		});
	}

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
		result: GoAST.createBooleanLiteral({
			value: !unionType && hasEitherVariantKind(goInputType, kind),
		}),
	});
}

export function isRightExpressionHandler(node: TsAST.Node, context: BuildContext) {
	return eitherKindExpressionHandler(node, context, "right");
}

export function isLeftExpressionHandler(node: TsAST.Node, context: BuildContext) {
	return eitherKindExpressionHandler(node, context, "left");
}
