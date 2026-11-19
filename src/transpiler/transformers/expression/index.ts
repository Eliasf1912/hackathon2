import * as DCommon from "@duplojs/lang/common";
import { type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { duploJSExpressionTransformers } from "../duplojs";
import { identifierTransformer } from "../common";
import { numericLiteralTransformer } from "./numericLiteral";
import { sharedExpressionTransformers } from "../shared";
import { binaryExpressionTransformer } from "./binary";
import { prefixUnaryExpressionTransformer } from "./unary";
import { booleanLiteralTransformer, stringLiteralTransformer } from "./literal";
import { arrayLiteralTransformer } from "./array";
import { functionExpressionTransformer } from "./function";
import { conditionalExpressionTransformer } from "./conditional";
import { nullishLiteralTransformer } from "./nullish";
import { templateExpressionTransformer } from "./template";
import { awaitExpressionTransformer } from "./await";
import { parenthesizedExpressionTransformer } from "./parenthesized";
import { regularExpressionTransformer } from "./regularExpression";
import { objectLiteralTransformer } from "./object";
import { builtinCallTransformer } from "./builtin";
import { propertyAccessTransformer } from "./propertyAccess";
import { elementAccessTransformer } from "./elementAccess";
import { nullishCoalescingTransformer } from "./nullishCoalescing";

export const expressionTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Expression>[] => [
		...duploJSExpressionTransformers.value,
		builtinCallTransformer,
		...sharedExpressionTransformers.value,
		nullishLiteralTransformer,
		identifierTransformer,
		numericLiteralTransformer,
		stringLiteralTransformer,
		booleanLiteralTransformer,
		binaryExpressionTransformer,
		prefixUnaryExpressionTransformer,
		arrayLiteralTransformer,
		functionExpressionTransformer,
		conditionalExpressionTransformer,
		templateExpressionTransformer,
		awaitExpressionTransformer,
		parenthesizedExpressionTransformer,
		regularExpressionTransformer,
		objectLiteralTransformer,
		propertyAccessTransformer,
		elementAccessTransformer,
		nullishCoalescingTransformer,
	],
);
