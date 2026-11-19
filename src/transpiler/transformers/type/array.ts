import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { typeTransformers } from "./index";
import * as DEither from "@duplojs/lang/either";
import * as DCommon from "@duplojs/lang/common";

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

		return context.success({
			result: GoAST.createSliceType({
				elementType: elementType.result,
			}),
		});
	},
);

