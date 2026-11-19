import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { SignatureKind, type Signature } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { createKindCheck, createValueGetter, mergeEitherMembers, resolveEitherMembers, type EitherMember } from "../members";
import { useGoType } from "../../../../resolveGoType";

interface RightPipeValues {
	before: readonly GoAST.Statement[];
	identifiers: readonly GoAST.Identifier[];
}

interface RightPipeSteps {
	before: readonly GoAST.Statement[];
	statements: readonly GoAST.Statement[];
	previousMembers: readonly EitherMember[];
	leftMembers: readonly EitherMember[];
}

/**
 * `DEither.rightPipe(input, ...steps)` is inlined. The input and the steps are
 * evaluated in source order, then each step runs only while no Left appeared:
 *
 * ```go
 * var result any = input
 * if !(EitherIs[EitherLeft[float64]](result)) { result = step1(<value of result>) }
 * if !(EitherIs[EitherLeft[float64]](result)) { result = step2(<value of result>) }
 * ```
 *
 * The Left check covers the Left variants of the input and of every previous
 * step, given by the checker. The first Left stops the chain and is returned
 * unchanged, with its information. A step returning a plain value instead of
 * an Either is refused by the variant resolution.
 */
export async function rightPipeExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node) || DArray.lengthEqual(node.arguments, 0)) {
		return context.notSupport();
	}

	const inputNode = DArray.first(node.arguments);

	if (!inputNode) {
		return context.notSupport();
	}

	const { typeChecker } = context.transpilation;

	const inputMembers = await resolveEitherMembers(
		await typeChecker.getTypeAtLocation(inputNode),
		inputNode,
		context,
	);

	if (DEither.isLeft(inputMembers)) {
		return inputMembers;
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
			DArray.reduceFrom<RightPipeValues>({
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
		return context.error(node, "right-pipe-without-input");
	}

	const resultDeclaration = GoAST.createVariableDeclarationInitialized({
		identifier: context.generateIdentifier(),
		typeReference: GoAST.builtinTypeReferences.any,
		initializer: input,
	});

	const result = resultDeclaration.identifier;

	// Types of each step: the value it receives and the variants it returns.
	const stepTypes = await DCommon.asyncPipe(
		DArray.shift(node.arguments),
		DArray.map(
			async(stepNode, { index }) => {
				const step = DArray.at(DArray.shift(values.identifiers), index);
				const stepSignature: Signature | undefined = DArray.first(
					await typeChecker.getSignaturesOfType(
						await typeChecker.getTypeAtLocation(stepNode),
						SignatureKind.Call,
					),
				);

				if (!step || !stepSignature) {
					return context.error(stepNode, "unresolved-right-pipe-step");
				}

				// A step declared without parameter is called without the value.
				const takesValue = !(
					(TsAST.isArrowFunction(stepNode) || TsAST.isFunctionExpression(stepNode))
					&& DArray.lengthEqual(stepNode.parameters, 0)
				);

				const valueType = takesValue
					? await useGoType(
						await typeChecker.getParameterType(stepSignature, 0),
						stepNode,
						context,
					)
					: undefined;

				if (valueType && DEither.isLeft(valueType)) {
					return valueType;
				}

				const members = await resolveEitherMembers(
					await typeChecker.getReturnTypeOfSignature(stepSignature),
					stepNode,
					context,
				);

				if (DEither.isLeft(members)) {
					return members;
				}

				return {
					step,
					valueType,
					members,
				};
			},
		),
		DCommon.promiseAll,
	);

	const steps = DArray.reduce(
		stepTypes,
		DArray.reduceFrom<RightPipeSteps>({
			before: [],
			statements: [],
			previousMembers: inputMembers,
			leftMembers: DArray.filter(inputMembers, (member) => member.kind === "left"),
		}),
		({ element, lastValue, next, exit }) => {
			if (DEither.isLeft(element)) {
				return exit(element);
			}

			const stepValue = element.valueType
				? [
					GoAST.createCallExpression({
						callee: createValueGetter(lastValue.previousMembers, element.valueType, context),
						arguments: [result],
					}),
				]
				: [];

			return next({
				before: lastValue.before,
				statements: DArray.push(
					lastValue.statements,
					GoAST.createIfStatement({
						condition: GoAST.createUnaryExpression({
							operator: "!",
							operand: createKindCheck(lastValue.leftMembers, "left", result, context),
						}),
						body: GoAST.createBlockStatement({
							statements: [
								GoAST.createAssignmentStatement({
									targets: DCommon.cast([result]),
									values: DCommon.cast([
										GoAST.createCallExpression({
											callee: element.step,
											arguments: stepValue,
										}),
									]),
								}),
							],
						}),
					}),
				),
				previousMembers: element.members,
				leftMembers: mergeEitherMembers(
					lastValue.leftMembers,
					DArray.filter(element.members, (member) => member.kind === "left"),
				),
			});
		},
	);

	if (DEither.isLeft(steps)) {
		return steps;
	}

	return context.success({
		before: DArray.concat(
			values.before,
			steps.before,
			[resultDeclaration],
			steps.statements,
		),
		result,
	});
}
