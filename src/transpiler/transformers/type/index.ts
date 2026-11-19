import * as DCommon from "@duplojs/lang/common";
import { type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { duploJSTypeTransformers } from "../duplojs";
import { sharedTypeTransformers } from "../shared";
import { float64TypeTransformer } from "./float";
import { parenthesizedTypeTransformer } from "./parenthesized";
import { unionTypeTransformer } from "./union";
import { anyTypeTransformer } from "./any";
import { promiseTypeTransformer } from "./promise";
import { stringTypeTransformer } from "./string";
import { booleanTypeTransformer } from "./boolean";
import { arrayTypeTransformer } from "./array";

export {
	float64TypeTransformer,
	parenthesizedTypeTransformer,
	unionTypeTransformer,
	anyTypeTransformer,
	promiseTypeTransformer,
	stringTypeTransformer,
	booleanTypeTransformer,
	arrayTypeTransformer,
};

export const typeTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Type | GoAST.TypeReference>[] => [
		parenthesizedTypeTransformer,
		promiseTypeTransformer,
		arrayTypeTransformer,
		...duploJSTypeTransformers.value,
		...sharedTypeTransformers.value,
		float64TypeTransformer,
		stringTypeTransformer,
		booleanTypeTransformer,
		unionTypeTransformer,
		anyTypeTransformer,
	],
);
