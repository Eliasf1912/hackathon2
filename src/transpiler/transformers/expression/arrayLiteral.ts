import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { expressionTransformers } from ".";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";

export const arrayLiteralTransformer: Transformer<GoAST.SliceLiteral> = createTransformer(
	async(node, context) => {
		if (!TsAST.isArrayLiteralExpression(node)) {
			return context.notSupport();
		}

		const elementsResult = await DCommon.asyncPipe(
			node.elements,
			DArray.map(
				(element) => DCommon.asyncPipe(
					context.transform(element, expressionTransformers.value),
					DEither.unwrapRight,
				),
			),
			DCommon.promiseAll,
			DArray.reduce(
				DArray.reduceFrom<{
					before: readonly GoAST.Statement[];
					elements: readonly GoAST.Expression[];
				}>({
					before: [],
					elements: [],
				}),
				({ element, lastValue, next, exit }) => {
					if (DEither.isLeft(element)) {
						return exit(element);
					}

					return next({
						before: DArray.concat(lastValue.before, element.before),
						elements: DArray.push(lastValue.elements, element.result),
					});
				},
			),
		);

		if (DEither.isLeft(elementsResult)) {
			return elementsResult;
		}

		const sliceAnyType = GoAST.createSliceType({
			elementType: GoAST.builtinTypeReferences.any,
		});

		return context.success({
			before: elementsResult.before,
			result: GoAST.createSliceLiteral({
				typeReference: sliceAnyType,
				elements: elementsResult.elements,
			}),
		});
	},
);

