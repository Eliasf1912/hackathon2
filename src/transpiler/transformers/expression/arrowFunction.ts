import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DNumber from "@duplojs/lang/number";
import { SignatureKind, type Signature } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { useGoType } from "../../resolveGoType";
import { blockStatementTransformer } from "../statement/block";
import { expressionTransformers } from ".";

interface FunctionParameters {
	arguments: readonly GoAST.FunctionArgument[];
	prelude: readonly GoAST.Statement[];
}

/**
 * Go has no destructuring in parameters: `([one, two]) => ...` receives the
 * value in a generated parameter, then the body starts with `one := value[0]`
 * and `two := value[1]`. Omitted positions are skipped.
 *
 * Go refuses a local variable that is never read: a destructured variable
 * whose only reference is its declaration is marked as used with `_ = name`.
 */
async function destructureParameter(
	pattern: TsAST.ArrayBindingPattern,
	type: GoAST.FunctionArgument["type"],
	context: BuildContext,
) {
	const parameterIdentifier = context.generateIdentifier();
	const { typeChecker } = context.transpilation;

	const prelude = await DCommon.asyncPipe(
		pattern.elements,
		DArray.map(
			async(element, { index }): Promise<readonly GoAST.Statement[]> => {
				if (
					!TsAST.isBindingElement(element)
					|| !element.name
					|| !TsAST.isIdentifier(element.name)
				) {
					return [];
				}

				const identifier = context.createSourceIdentifier(element.name.text);
				const symbol = await typeChecker.getSymbolAtLocation(element.name);
				const references = symbol
					? await typeChecker.getReferencesToSymbolInFile(context.file.sourceFile.path, symbol)
					: [];

				const declaration = GoAST.createShortVariableDeclarationStatement({
					identifier,
					initializer: GoAST.createIndexExpression({
						target: parameterIdentifier,
						index: GoAST.createIntegerLiteral({ value: BigInt(index) }),
					}),
				});

				return DArray.length(references) > 1
					? [declaration]
					: [
						declaration,
						GoAST.createAssignmentStatement({
							targets: DCommon.cast([GoAST.createIdentifier("_")]),
							values: DCommon.cast([identifier]),
						}),
					];
			},
		),
		DCommon.promiseAll,
		DArray.reduce(
			DArray.reduceFrom<readonly GoAST.Statement[]>([]),
			({ element, lastValue, next }) => next(DArray.concat(lastValue, element)),
		),
	);

	return {
		argument: GoAST.createFunctionArgument({
			identifier: parameterIdentifier,
			type,
		}),
		prelude,
	};
}

async function transformBody(
	node: TsAST.ArrowFunction,
	context: BuildContext,
) {
	if (TsAST.isBlock(node.body)) {
		return DCommon.asyncPipe(
			context.transform(node.body, [blockStatementTransformer]),
			DEither.unwrapRight,
		);
	}

	const expression = await DCommon.asyncPipe(
		context.transform(node.body, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(expression)) {
		return expression;
	}

	return {
		before: [],
		result: GoAST.createBlockStatement({
			statements: DArray.push(
				expression.before,
				GoAST.createReturnStatement({ values: [expression.result] }),
			),
		}),
	};
}

/**
 * An arrow function becomes a Go function literal.
 *
 * Go calls a function with exactly its declared arguments. A callback that
 * ignores the value it receives (`() => [-12]` given to `otherwise`) still has
 * to accept it: the literal takes the parameters of the expected callback, at
 * least the first one, and names the unused ones `_`.
 */
export const arrowFunctionTransformer: Transformer<GoAST.FunctionLiteral> = createTransformer(
	async(node, context) => {
		if (!TsAST.isArrowFunction(node) || node.asteriskToken) {
			return context.notSupport();
		}

		const isAsync = DArray.some(
			node.modifiers ?? [],
			(modifier) => modifier.kind === TsAST.SyntaxKind.AsyncKeyword,
		);

		// Parameters are identifiers or positional destructurings `[a, , b]` without default nor rest.
		const supportedParameters = DArray.every(
			node.parameters,
			(parameter) => !parameter.dotDotDotToken
				&& (
					TsAST.isIdentifier(parameter.name)
					|| (
						TsAST.isArrayBindingPattern(parameter.name)
						&& DArray.every(
							parameter.name.elements,
							(element) => TsAST.isOmittedExpression(element)
								|| (
									TsAST.isBindingElement(element)
									&& element.name !== undefined
									&& TsAST.isIdentifier(element.name)
									&& !element.initializer
									&& !element.dotDotDotToken
								),
						)
					)
				),
		);

		if (isAsync || !supportedParameters) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;
		const ownSignature = await typeChecker.getSignatureFromDeclaration(node);
		const contextualType = await typeChecker.getContextualType(node);
		const contextualSignature: Signature | undefined = contextualType && DArray.first(
			await typeChecker.getSignaturesOfType(contextualType, SignatureKind.Call),
		);

		const parameterSignature = contextualSignature ?? ownSignature;
		const parameterCount = contextualSignature
			? DNumber.min([
				DArray.length(contextualSignature.parameters),
				DNumber.max([DArray.length(node.parameters), 1] as const),
			] as const)
			: DArray.length(node.parameters);

		const functionArguments = await DCommon.asyncPipe(
			DArray.from({ length: parameterCount }),
			DArray.map(
				async(_element, { index }) => {
					const parameter = DArray.at(node.parameters, index);
					const type = await useGoType(
						await typeChecker.getParameterType(parameterSignature, index),
						node,
						context,
					);

					if (DEither.isLeft(type)) {
						return type;
					}

					if (parameter && TsAST.isArrayBindingPattern(parameter.name)) {
						return destructureParameter(parameter.name, type, context);
					}

					return {
						argument: GoAST.createFunctionArgument({
							identifier: parameter && TsAST.isIdentifier(parameter.name)
								? context.createSourceIdentifier(parameter.name.text)
								: GoAST.createIdentifier("_"),
							type: type,
						}),
						prelude: [],
					};
				},
			),
			DCommon.promiseAll,
			DArray.reduce(
				DArray.reduceFrom<FunctionParameters>({
					arguments: [],
					prelude: [],
				}),
				({ element, lastValue, next, exit }) => {
					if (DEither.isLeft(element)) {
						return exit(element);
					}

					return next({
						arguments: DArray.push(lastValue.arguments, element.argument),
						prelude: DArray.concat(lastValue.prelude, element.prelude),
					});
				},
			),
		);

		if (DEither.isLeft(functionArguments)) {
			return functionArguments;
		}

		const returnType = await useGoType(
			await typeChecker.getReturnTypeOfSignature(ownSignature),
			node,
			context,
		);

		if (DEither.isLeft(returnType)) {
			return returnType;
		}

		const body = await transformBody(node, context);

		if (DEither.isLeft(body)) {
			return body;
		}

		return context.success({
			result: GoAST.createFunctionLiteral({
				arguments: functionArguments.arguments,
				returnTypes: [returnType],
				body: GoAST.createBlockStatement({
					statements: DArray.concat(functionArguments.prelude, body.result.statements),
				}),
			}),
		});
	},
);
