import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import { convertExpressionToType, transformCheckerType } from "../type/union";

/**
 * `[a, b]` → `[]T{a, b}`, avec `T` d'après le type que le checker donne au littéral
 * (tableau ou tuple homogène). Chaque élément est converti vers `T`.
 *
 * Limite connue : l'élément `...spread` n'est pas pris en charge.
 */
export const arrayLiteralTransformer: Transformer<GoAST.SliceLiteral> = createTransformer(
	async(node, context) => {
		if (!TsAST.isArrayLiteralExpression(node)) {
			return context.notSupport();
		}

		if (DArray.some(node.elements, TsAST.isSpreadElement)) {
			return context.error(node, "un-support-array-spread");
		}

		const sliceType = await transformCheckerType(
			await context.transpilation.typeChecker.getTypeAtLocation(node),
			node,
			context,
		);

		if (DEither.isLeft(sliceType)) {
			return sliceType;
		}

		const goType = DEither.unwrapRight(sliceType);

		if (!DModeling.hasTagValue(goType, "[node][type]slice")) {
			return context.error(node, "un-support-array-literal-type");
		}

		const elements = await DCommon.asyncPipe(
			node.elements,
			DArray.map(
				async(element) => {
					const transformed = await DCommon.asyncPipe(
						context.transform(element, expressionTransformers.value),
						DEither.unwrapRight,
					);

					if (DEither.isLeft(transformed)) {
						return transformed;
					}

					const converted = await convertExpressionToType(
						{
							node: element,
							expression: transformed.result,
							targetType: goType.elementType,
						},
						context,
					);

					if (DEither.isLeft(converted)) {
						return converted;
					}

					return DEither.right("array-element", {
						before: transformed.before,
						result: DEither.unwrapRight(converted),
					});
				},
			),
			DCommon.promiseAll,
		);

		const failedElement = DArray.find(elements, DEither.isLeft);

		if (failedElement) {
			return failedElement;
		}

		const transformedElements = DArray.map(
			DArray.filter(elements, DEither.isRight),
			DEither.unwrapRight,
		);

		return context.success({
			before: DArray.flatMap(transformedElements, ({ before }) => before),
			result: GoAST.createSliceLiteral({
				typeReference: goType,
				elements: DArray.map(transformedElements, ({ result }) => result),
			}),
		});
	},
);
