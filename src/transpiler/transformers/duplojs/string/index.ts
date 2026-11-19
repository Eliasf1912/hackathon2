import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DPattern from "@duplojs/lang/pattern";
import { createTransformer, type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import { type BuildContext } from "../../../context/build";
import { importStandardPackage } from "../../shared";
import { simpleFunctionHandler } from "../simpleFunction";
import { toExpressionHandler } from "./to";
import { stringLengthDependency, stringLengthIdentifier } from "./length";
import { padStartDependency, padStartIdentifier } from "./padStart";

/**
 * `DString.includes(text, search)` → `strings.Contains(text, search)`.
 */
function includesExpressionHandler(node: TsAST.Node, context: BuildContext) {
	return simpleFunctionHandler(
		{
			node,
			name: "includes",
			arity: 2,
			build: ([text, search]) => text && search && GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: importStandardPackage("strings", context),
					identifier: GoAST.createIdentifier("Contains"),
				}),
				arguments: [text, search],
			}),
		},
		context,
	);
}

/**
 * `DString.test(text, /motif/)` → `motif.MatchString(text)` (expression compilée une fois,
 * voir `expression/regularExpression.ts`).
 */
function testExpressionHandler(node: TsAST.Node, context: BuildContext) {
	return simpleFunctionHandler(
		{
			node,
			name: "test",
			arity: 2,
			build: ([text, expression]) => text && expression && GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: expression,
					identifier: GoAST.createIdentifier("MatchString"),
				}),
				arguments: [text],
			}),
		},
		context,
	);
}

/**
 * `DString.length(text)` → `shard_dependencies.StringLength(text)` (unités UTF-16, comme JS).
 */
function lengthExpressionHandler(node: TsAST.Node, context: BuildContext) {
	return simpleFunctionHandler(
		{
			node,
			name: "length",
			arity: 1,
			build: ([text]) => text && GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: context.registerSharedDependency(stringLengthDependency.value),
					identifier: stringLengthIdentifier,
				}),
				arguments: [text],
			}),
		},
		context,
	);
}

/**
 * Fonctions du domaine `@duplojs/lang/string` (`DString.*`).
 * Une fonction non encore traduite est signalée explicitement (`transformation-error`).
 */
export const duploJSStringExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		const reference = TsAST.isCallExpression(node)
			? node.expression
			: node;

		if (
			!TsAST.isIdentifier(reference)
			&& !TsAST.isPropertyAccessExpression(reference)
		) {
			return context.notSupport();
		}

		const moduleReference = await DCommon.asyncPipe(
			context.resolveReferenceModule(reference, "@duplojs/lang", /^dist\/string\//),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(moduleReference)) {
			return context.notSupport();
		}

		return DCommon.pipe(
			moduleReference.symbol.name,
			DPattern.match(
				DCommon.equal("to"),
				() => toExpressionHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("includes"),
				() => includesExpressionHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("test"),
				() => testExpressionHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("padStart"),
				() => simpleFunctionHandler(
					{
						node,
						name: "padStart",
						arity: 3,
						build: ([text, length, pad]) => text && length && pad && GoAST.createCallExpression({
							callee: GoAST.createSelectorExpression({
								target: context.registerSharedDependency(padStartDependency.value),
								identifier: padStartIdentifier,
							}),
							arguments: [text, length, pad],
						}),
					},
					context,
				),
			),
			DPattern.match(
				DCommon.equal("length"),
				() => lengthExpressionHandler(node, context),
			),
			DPattern.otherwise(
				() => context.error(node),
			),
		);
	},
);
