import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { SignatureKind, type Signature } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { createInformationStatements, createValueGetter, resolveEitherMembers } from "../members";
import { useGoType } from "../../../../resolveGoType";

interface MatchCases {
	before: readonly GoAST.Statement[];
	cases: readonly GoAST.ExpressionSwitchCase[];
}

/**
 * `DEither.matchInformation(input, { information: callback })` becomes a
 * switch on the information of the input. Each case gives the value of the
 * Either to its callback.
 *
 * TypeScript proves that every information is handled; Go cannot check it.
 * The `default` case panics if an unexpected information reaches the switch.
 */
export async function matchInformationExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node) || !DArray.lengthEqual(node.arguments, 2)) {
		return context.notSupport();
	}

	const inputNode = DArray.at(node.arguments, 0);
	const matcherNode = DArray.at(node.arguments, 1);

	if (
		!inputNode
		|| !matcherNode
		|| !TsAST.isObjectLiteralExpression(matcherNode)
		|| !DArray.every(
			matcherNode.properties,
			(property) => TsAST.isPropertyAssignment(property)
				&& (TsAST.isIdentifier(property.name) || TsAST.isStringLiteral(property.name)),
		)
	) {
		return context.notSupport();
	}

	const { typeChecker } = context.transpilation;
	const signature = await typeChecker.getResolvedSignature(node);
	const matcherType = await typeChecker.getParameterType(signature, 1);

	const outputType = await useGoType(
		await typeChecker.getTypeAtLocation(node),
		node,
		context,
	);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const members = await resolveEitherMembers(
		await typeChecker.getTypeAtLocation(inputNode),
		node,
		context,
	);

	if (DEither.isLeft(members)) {
		return members;
	}

	const input = await DCommon.asyncPipe(
		context.transform(inputNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(input)) {
		return input;
	}

	const inputStatement = GoAST.createShortVariableDeclarationStatement({
		identifier: context.generateIdentifier(),
		initializer: input.result,
	});

	const resultDeclaration = GoAST.createVariableDeclarationZeroValue({
		identifier: context.generateIdentifier(),
		typeReference: outputType,
	});

	const matchCases = await DCommon.asyncPipe(
		matcherNode.properties,
		DArray.map(
			async(property) => {
				if (
					!TsAST.isPropertyAssignment(property)
					|| (!TsAST.isIdentifier(property.name) && !TsAST.isStringLiteral(property.name))
				) {
					return context.error(property, "unsupported-match-information-property");
				}

				// A callback declared without parameter is called without the value.
				const initializer = property.initializer;
				const takesValue = !(
					(TsAST.isArrowFunction(initializer) || TsAST.isFunctionExpression(initializer))
					&& DArray.lengthEqual(initializer.parameters, 0)
				);

				const expectedCallbackType = await typeChecker.getTypeOfPropertyOfType(
					matcherType,
					property.name.text,
				);
				const callbackSignature: Signature | undefined = expectedCallbackType && DArray.first(
					await typeChecker.getSignaturesOfType(expectedCallbackType, SignatureKind.Call),
				);

				if (!callbackSignature) {
					return context.error(property, "unresolved-match-information-callback");
				}

				const valueType = takesValue
					? await useGoType(
						await typeChecker.getParameterType(callbackSignature, 0),
						property,
						context,
					)
					: undefined;

				if (valueType && DEither.isLeft(valueType)) {
					return valueType;
				}

				const callback = await DCommon.asyncPipe(
					context.transform(property.initializer, expressionTransformers.value),
					DEither.unwrapRight,
				);

				if (DEither.isLeft(callback)) {
					return callback;
				}

				const callbackStatement = GoAST.createShortVariableDeclarationStatement({
					identifier: context.generateIdentifier(),
					initializer: callback.result,
				});

				const callbackArguments = valueType
					? [
						GoAST.createCallExpression({
							callee: createValueGetter(members, valueType, context),
							arguments: [inputStatement.identifier],
						}),
					]
					: [];

				return {
					before: DArray.concat(callback.before, [callbackStatement]),
					switchCase: GoAST.createExpressionSwitchCase({
						expressions: DCommon.cast([GoAST.createStringLiteral({ value: property.name.text })]),
						statements: [
							GoAST.createAssignmentStatement({
								targets: DCommon.cast([resultDeclaration.identifier]),
								values: DCommon.cast([
									GoAST.createCallExpression({
										callee: callbackStatement.identifier,
										arguments: callbackArguments,
									}),
								]),
							}),
						],
					}),
				};
			},
		),
		DCommon.promiseAll,
		DArray.reduce(
			DArray.reduceFrom<MatchCases>({
				before: [],
				cases: [],
			}),
			({ element, lastValue, next, exit }) => {
				if (DEither.isLeft(element)) {
					return exit(element);
				}

				return next({
					before: DArray.concat(lastValue.before, element.before),
					cases: DArray.push(lastValue.cases, element.switchCase),
				});
			},
		),
	);

	if (DEither.isLeft(matchCases)) {
		return matchCases;
	}

	const information = context.generateIdentifier();

	return context.success({
		before: DArray.concat(
			input.before,
			[inputStatement],
			matchCases.before,
			createInformationStatements(members, inputStatement.identifier, information, context),
			[
				resultDeclaration,
				GoAST.createExpressionSwitchStatementWithDefault({
					expression: information,
					casesBeforeDefault: matchCases.cases,
					defaultCase: GoAST.createDefaultCase({
						statements: [
							GoAST.createCallExpression({
								callee: GoAST.createIdentifier("panic"),
								arguments: [
									GoAST.createBinaryExpression({
										operator: "+",
										left: GoAST.createStringLiteral({
											value: "matchInformation: unhandled information ",
										}),
										right: information,
									}),
								],
							}),
						],
					}),
					casesAfterDefault: [],
				}),
			],
		),
		result: resultDeclaration.identifier,
	});
}
