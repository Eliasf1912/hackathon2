import * as DCommon from "@duplojs/lang/common";
import type { GoAST } from "@go";
import { type Transformer } from "@transformer";
import { duploJSStatementTransformers } from "../duplojs";
import { sharedStatementTransformers } from "../shared";
import { blockStatementTransformer } from "./block";
import { returnStatementTransformer } from "./return";
import { variableStatementTransformer } from "./variable";
import { ifStatementTransformer } from "./if";
import { throwStatementTransformer } from "./throw";
import { tryStatementTransformer } from "./try";
import { loopStatementTransformer } from "./loop";
import { switchStatementTransformer } from "./switch";

export {
	blockStatementTransformer,
	returnStatementTransformer,
	variableStatementTransformer,
	ifStatementTransformer,
	throwStatementTransformer,
	tryStatementTransformer,
	loopStatementTransformer,
	switchStatementTransformer,
};

export const statementTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Statement>[] => [
		...duploJSStatementTransformers.value,
		...sharedStatementTransformers.value,
		blockStatementTransformer,
		returnStatementTransformer,
		variableStatementTransformer,
		ifStatementTransformer,
		throwStatementTransformer,
		tryStatementTransformer,
		loopStatementTransformer,
		switchStatementTransformer,
	],
);
