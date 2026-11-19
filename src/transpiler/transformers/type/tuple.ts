import { GoAST, GoPrinter } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { typeTransformers } from ".";

/**
 * A tuple is a JavaScript array at runtime, so it becomes a Go slice.
 * When every element shares the same Go type the slice keeps it (`[]float64`),
 * otherwise the elements are stored as `any`.
 */
export const tupleTypeTransformer: Transformer<GoAST.SliceType> = createTransformer(
	async(node, context) => {
		if (!TsAST.isTupleTypeNode(node)) {
			return context.notSupport();
		}

		const elementTypes = await DCommon.asyncPipe(
			node.elements,
			DArray.map(
				(element) => DCommon.asyncPipe(
					context.transform(element, typeTransformers.value),
					DEither.unwrapRight,
				),
			),
			DCommon.promiseAll,
			DArray.reduce(
				DArray.reduceFrom<readonly (GoAST.Type | GoAST.TypeReference)[]>([]),
				({ element, lastValue, next, exit }) => {
					if (DEither.isLeft(element)) {
						return exit(element);
					}

					if (!DArray.lengthEqual(element.before, 0)) {
						return exit(context.error(node, "un-support-before-on-tuple-element"));
					}

					return next(DArray.push(lastValue, element.result));
				},
			),
		);

		if (DEither.isLeft(elementTypes)) {
			return elementTypes;
		}

		const firstElementType = DArray.first(elementTypes);

		const isHomogeneous = firstElementType !== undefined && DArray.every(
			elementTypes,
			(elementType) => DCommon.equal(
				GoPrinter.renderNode(elementType),
				GoPrinter.renderNode(firstElementType),
			),
		);

		return context.success({
			result: GoAST.createSliceType({
				elementType: isHomogeneous
					? firstElementType
					: GoAST.builtinTypeReferences.any,
			}),
		});
	},
);
