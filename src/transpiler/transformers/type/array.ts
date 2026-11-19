import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { typeTransformers } from ".";

export const arrayTypeTransformer: Transformer<GoAST.SliceType> = createTransformer(
	async(node, context) => {
		if (!TsAST.isArrayTypeNode(node)) {
			return context.notSupport();
		}

		const elementType = await DCommon.asyncPipe(
			context.transform(node.elementType, typeTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(elementType)) {
			return elementType;
		}

		if (!DArray.lengthEqual(elementType.before, 0)) {
			return context.error(node, "un-support-before-on-array-element");
		}

		return context.success({
			result: GoAST.createSliceType({
				elementType: elementType.result,
			}),
		});
	},
);
