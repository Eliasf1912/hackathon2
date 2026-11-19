import * as DCommon from "@duplojs/lang/common";
import { duploJSEitherDeclarationTransformer, duploJSEitherExpressionTransformer, duploJSEitherTypeTransformer } from "./either";
import { duploJSCommonDeclarationTransformer, duploJSCommonExpressionTransformer, duploJSCommonTypeTransformer } from "./common";
import { duploJSArrayDeclarationTransformer, duploJSArrayExpressionTransformer, duploJSArrayTypeTransformer } from "./array";
import { duploJSStringDeclarationTransformer, duploJSStringExpressionTransformer, duploJSStringTypeTransformer } from "./string";
import type { GoAST } from "@go";
import { type Transformer } from "@transformer";

export {
	duploJSEitherDeclarationTransformer,
	duploJSEitherExpressionTransformer,
	duploJSEitherTypeTransformer,
	duploJSCommonDeclarationTransformer,
	duploJSCommonExpressionTransformer,
	duploJSCommonTypeTransformer,
	duploJSArrayDeclarationTransformer,
	duploJSArrayExpressionTransformer,
	duploJSArrayTypeTransformer,
	duploJSStringDeclarationTransformer,
	duploJSStringExpressionTransformer,
	duploJSStringTypeTransformer,
};

export const duploJSDeclarationTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Declaration>[] => [
		duploJSEitherDeclarationTransformer,
		duploJSCommonDeclarationTransformer,
		duploJSArrayDeclarationTransformer,
		duploJSStringDeclarationTransformer,
	],
);
export const duploJSExpressionTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Expression>[] => [
		duploJSEitherExpressionTransformer,
		duploJSCommonExpressionTransformer,
		duploJSArrayExpressionTransformer,
		duploJSStringExpressionTransformer,
	],
);
export const duploJSStatementTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Statement>[] => [],
);
export const duploJSTypeTransformers = DCommon.memo(
	() => [
		duploJSEitherTypeTransformer,
		duploJSCommonTypeTransformer,
		duploJSArrayTypeTransformer,
		duploJSStringTypeTransformer,
	],
);
