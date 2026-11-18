import * as DCommon from "@duplojs/lang/common";
import { type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { duploJSTypeTransformers } from "../duplojs";
import { sharedTypeTransformers } from "../shared";
import { float64TypeTransformer } from "./float";
import { boolTypeTransformer } from "./boolean";
import { parenthesizedTypeTransformer } from "./parenthesized";
import { literalTypeTransformer } from "./literal";
import { unionTypeTransformer } from "./union";
import { arrayTypeTransformer, readonlyTypeTransformer } from "./array";
import { stringTypeTransformer } from "./string";
import { intersectionTypeTransformer } from "./intersection";

export const typeTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Type | GoAST.TypeReference>[] => [
		...duploJSTypeTransformers.value,
		...sharedTypeTransformers.value,
		float64TypeTransformer,
		boolTypeTransformer,
		parenthesizedTypeTransformer,
		literalTypeTransformer,
		unionTypeTransformer,
		readonlyTypeTransformer,
		arrayTypeTransformer,
		stringTypeTransformer,
		intersectionTypeTransformer,
	],
);
