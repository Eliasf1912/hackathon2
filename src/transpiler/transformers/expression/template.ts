import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import { sequenceEvaluations } from "../shared";
import { createToStringExpression } from "../duplojs/string/to";
import { transformCheckerType } from "../type/union";

/**
 * `` `a ${x} b` `` → `"a " + texte(x) + " b"`, où `texte` est la conversion JS
 * (`DString.to`) : une chaîne telle quelle, un nombre par `NumberToString`.
 */
export const templateExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isTemplateExpression(node)) {
			return context.notSupport();
		}

		const spans = await DCommon.asyncPipe(
			node.templateSpans,
			DArray.map(
				async(span) => {
					const value = await DCommon.asyncPipe(
						context.transform(span.expression, expressionTransformers.value),
						DEither.unwrapRight,
					);

					if (DEither.isLeft(value)) {
						return value;
					}

					const type = await transformCheckerType(
						await context.transpilation.typeChecker.getTypeAtLocation(span.expression),
						span.expression,
						context,
					);

					if (DEither.isLeft(type)) {
						return type;
					}

					const text = createToStringExpression(value.result, DEither.unwrapRight(type), context);

					if (!text) {
						return context.error(span.expression, "un-support-template-value-type");
					}

					return DEither.right("template-span", {
						before: value.before,
						result: text,
						literal: GoAST.createStringLiteral({ value: span.literal.text }),
					});
				},
			),
			DCommon.promiseAll,
		);

		const failedSpan = DArray.find(spans, DEither.isLeft);

		if (failedSpan) {
			return failedSpan;
		}

		const transformedSpans = DArray.map(DArray.filter(spans, DEither.isRight), DEither.unwrapRight);

		// Ordre JS : une substitution ne doit pas être calculée après les calculs préalables
		// d'une substitution suivante.
		const { before, results } = sequenceEvaluations(transformedSpans, context);

		const isEmptyText = (part: GoAST.Expression) => DModeling.hasTagValue(part, "[node][expression]literal-string")
			&& part.value === "";

		// Les morceaux de texte vides (`${x}` en début ou en fin) ne servent à rien.
		const [first, ...rest] = DArray.filter(
			DArray.concat(
				[GoAST.createStringLiteral({ value: node.head.text })],
				DArray.flatMap(
					transformedSpans,
					({ literal }, { index }) => [DArray.at(results, index) ?? literal, literal],
				),
			),
			(part) => !isEmptyText(part),
		);

		return context.success({
			before,
			result: DArray.reduce(
				rest,
				DArray.reduceFrom<GoAST.Expression>(first ?? GoAST.createStringLiteral({ value: "" })),
				({ element, lastValue, next }) => next(
					GoAST.createBinaryExpression({
						operator: "+",
						left: lastValue,
						right: element,
					}),
				),
			),
		});
	},
);
