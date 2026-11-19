import * as DCommon from "@duplojs/lang/common";
import { type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { duploJSTypeTransformers } from "../duplojs";
import { sharedTypeTransformers } from "../shared";
import { float64TypeTransformer } from "./float";
import { parenthesizedTypeTransformer } from "./parenthesized";
import { unionTypeTransformer } from "./union";
import { readonlyTypeTransformer } from "./readonly";
import { tupleTypeTransformer } from "./tuple";
import { arrayTypeTransformer } from "./array";
import { brandedTypeTransformer } from "./intersection";
import { stringTypeTransformer } from "./string";
import { booleanTypeTransformer } from "./boolean";
import { literalTypeTransformer } from "./literal";
import { anyTypeTransformer } from "./any";
import { promiseTypeTransformer } from "./promise";
import { functionTypeTransformer } from "./function";

export const typeTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Type | GoAST.TypeReference>[] => [
		...duploJSTypeTransformers.value,
		...sharedTypeTransformers.value,
		float64TypeTransformer,
		parenthesizedTypeTransformer,
		unionTypeTransformer,
		readonlyTypeTransformer,
		tupleTypeTransformer,
		arrayTypeTransformer,
		brandedTypeTransformer,
		stringTypeTransformer,
		booleanTypeTransformer,
		literalTypeTransformer,
		anyTypeTransformer,
		promiseTypeTransformer,
		functionTypeTransformer,
	],
);
