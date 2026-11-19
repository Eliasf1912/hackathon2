import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import { stringToDependency, toFunctionIdentifier } from "../duplojs/string/to/sharedDependency";

export const templateLiteralTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (TsAST.isNoSubstitutionTemplateLiteral(node)) {
			return context.success({
				result: GoAST.createStringLiteral({ value: node.text }),
			});
		}

		if (!TsAST.isTemplateExpression(node)) {
			return context.notSupport();
		}

		const packageName = context.registerSharedDependency(stringToDependency.value);
		const stringToCallee = GoAST.createSelectorExpression({
			target: packageName,
			identifier: toFunctionIdentifier,
		});

		let combinedExpression: GoAST.Expression = GoAST.createStringLiteral({
			value: node.head.text,
		});
		let allBefore: readonly GoAST.Statement[] = [];

		for (const span of node.templateSpans) {
			const exprResult = await DCommon.asyncPipe(
				context.transform(span.expression, expressionTransformers.value),
				DEither.unwrapRight,
			);

			if (DEither.isLeft(exprResult)) {
				return exprResult;
			}

			allBefore = DArray.concat(allBefore, exprResult.before);

			const convertedString = GoAST.createCallExpression({
				callee: stringToCallee,
				arguments: [exprResult.result],
			});

			combinedExpression = GoAST.createBinaryExpression({
				left: combinedExpression,
				operator: "+",
				right: convertedString,
			});

			if (span.literal.text.length > 0) {
				combinedExpression = GoAST.createBinaryExpression({
					left: combinedExpression,
					operator: "+",
					right: GoAST.createStringLiteral({ value: span.literal.text }),
				});
			}
		}

		return context.success({
			before: allBefore,
			result: combinedExpression,
		});
	},
);

