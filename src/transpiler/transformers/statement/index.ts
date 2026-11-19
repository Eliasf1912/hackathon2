import * as DCommon from "@duplojs/lang/common";
import type { GoAST } from "@go";
import { type Transformer } from "@transformer";
import { duploJSStatementTransformers } from "../duplojs";
import { sharedStatementTransformers } from "../shared";
import { blockStatementTransformer } from "./block";
import { returnStatementTransformer } from "./return";
import { variableStatementTransformer } from "./variable";
import { ifStatementTransformer } from "./if";
import { forOfStatementTransformer } from "./forOf";
import { assignmentStatementTransformer } from "./assignment";
import { localFunctionTransformer } from "./localFunction";
import { expressionStatementTransformer } from "./expression";
import { switchStatementTransformer } from "./switch";
import { throwStatementTransformer } from "./throw";
import { tryStatementTransformer } from "./try";

export const statementTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Statement>[] => [
		throwStatementTransformer,
		tryStatementTransformer,
		...duploJSStatementTransformers.value,
		assignmentStatementTransformer,
		localFunctionTransformer,
		...sharedStatementTransformers.value,
		blockStatementTransformer,
		returnStatementTransformer,
		variableStatementTransformer,
		ifStatementTransformer,
		forOfStatementTransformer,
		switchStatementTransformer,
		expressionStatementTransformer,
	],
);
