import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";

interface PipeValues {
	before: readonly GoAST.Statement[];
	identifiers: readonly GoAST.Identifier[];
}

interface PipeApplication {
	before: readonly GoAST.Statement[];
	current: GoAST.Identifier;
}

/**
 * `DCommon.pipe(input, ...steps)` is inlined: the input and every step are
 * evaluated in source order, then each step is applied to the previous result.
 */
export async function pipeExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node)) {
		return context.notSupport();
	}

	const values = await DCommon.asyncPipe(
		node.arguments,
		DArray.map(
			(argument) => DCommon.asyncPipe(
				context.transform(argument, expressionTransformers.value),
				DEither.unwrapRight,
			),
		),
		DCommon.promiseAll,
		DArray.reduce(
			DArray.reduceFrom<PipeValues>({
				before: [],
				identifiers: [],
			}),
			({ element, lastValue, next, exit }) => {
				if (DEither.isLeft(element)) {
					return exit(element);
				}

				const valueStatement = GoAST.createShortVariableDeclarationStatement({
					identifier: context.generateIdentifier(),
					initializer: element.result,
				});

				return next({
					before: DArray.concat(lastValue.before, element.before, [valueStatement]),
					identifiers: DArray.push(lastValue.identifiers, valueStatement.identifier),
				});
			},
		),
	);

	if (DEither.isLeft(values)) {
		return values;
	}

	const input = DArray.first(values.identifiers);

	if (!input) {
		return context.error(node, "pipe-without-input");
	}

	const application = DArray.reduce(
		DArray.shift(values.identifiers),
		DArray.reduceFrom<PipeApplication>({
			before: values.before,
			current: input,
		}),
		({ element, lastValue, next }) => {
			const stepStatement = GoAST.createShortVariableDeclarationStatement({
				identifier: context.generateIdentifier(),
				initializer: GoAST.createCallExpression({
					callee: element,
					arguments: [lastValue.current],
				}),
			});

			return next({
				before: DArray.push(lastValue.before, stepStatement),
				current: stepStatement.identifier,
			});
		},
	);

	return context.success({
		before: application.before,
		result: application.current,
	});
}
