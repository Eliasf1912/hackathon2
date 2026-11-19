import * as DCommon from "@duplojs/lang/common";
import { type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { duploJSExpressionTransformers } from "../duplojs";
import { identifierTransformer } from "../common";
import { numericLiteralTransformer } from "./numericLiteral";
import { sharedExpressionTransformers } from "../shared";
import { binaryExpressionTransformer } from "./binary";
import { prefixUnaryExpressionTransformer } from "./prefixUnary";
import { arrayLiteralTransformer } from "./arrayLiteral";
import { arrowFunctionTransformer } from "./arrowFunction";
import { stringLiteralTransformer } from "./stringLiteral";
import { objectLiteralTransformer } from "./objectLiteral";
import { conditionalExpressionTransformer } from "./conditional";
import { awaitExpressionTransformer } from "./await";
import { booleanLiteralTransformer } from "./booleanLiteral";
import { parenthesizedExpressionTransformer } from "./parenthesized";
import { asExpressionTransformer } from "./as";
import { propertyAccessExpressionTransformer } from "./propertyAccess";
import { templateLiteralTransformer } from "./templateLiteral";

export {
	numericLiteralTransformer,
	binaryExpressionTransformer,
	prefixUnaryExpressionTransformer,
	arrayLiteralTransformer,
	arrowFunctionTransformer,
	stringLiteralTransformer,
	objectLiteralTransformer,
	conditionalExpressionTransformer,
	awaitExpressionTransformer,
	booleanLiteralTransformer,
	parenthesizedExpressionTransformer,
	asExpressionTransformer,
	propertyAccessExpressionTransformer,
	templateLiteralTransformer,
};

export const expressionTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Expression>[] => [
		arrowFunctionTransformer,
		awaitExpressionTransformer,
		parenthesizedExpressionTransformer,
		asExpressionTransformer,
		...duploJSExpressionTransformers.value,
		...sharedExpressionTransformers.value,
		identifierTransformer,
		numericLiteralTransformer,
		stringLiteralTransformer,
		templateLiteralTransformer,
		booleanLiteralTransformer,
		binaryExpressionTransformer,
		prefixUnaryExpressionTransformer,
		arrayLiteralTransformer,
		objectLiteralTransformer,
		propertyAccessExpressionTransformer,
		conditionalExpressionTransformer,
	],
);
