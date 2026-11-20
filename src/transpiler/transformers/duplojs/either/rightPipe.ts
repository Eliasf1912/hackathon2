import { GoAST } from "@go";
import { type NotfoundTransformer, type TransformationError } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { createFunctionValueCall } from "../../shared";
import { convertToType, transformCheckerType, type GoType } from "../../type/union";
import { chainBranches, flattenChain, getFunctionValueTypes, getRightValueType, getVariants, type Branch } from "./dispatch";
import { bindOnce } from "./isRight";
import { hasEitherVariantKind, valueFieldIdentifier } from "./sharedDependency";
import { eitherSuccessDependency, successFunctionIdentifier } from "./success/sharedDependency";

interface Step {
	before: readonly GoAST.Statement[];
	callee: GoAST.Expression;
	parameterCount: number;
	// Absent : l'étape ne déclare aucun paramètre (`() => …`), la valeur n'est pas passée.
	parameterType?: GoType;
	returnType: GoType;
}

type StepResult = TransformationError | NotfoundTransformer | DEither.Right<"step", Step>;

async function prepareStep(stepNode: TsAST.Expression, context: BuildContext): Promise<StepResult> {
	const transformed = await DCommon.asyncPipe(
		context.transform(stepNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(transformed)) {
		return transformed;
	}

	// Les types de l'étape elle-même : la valeur est convertie vers le paramètre qu'elle
	// déclare vraiment (`(v: number | string) => …` reçoit une union).
	const types = await getFunctionValueTypes(stepNode, context);

	if (DEither.isLeft(types)) {
		return types;
	}

	const bound = bindOnce(transformed.result, context);

	return DEither.right("step", {
		...DEither.unwrapRight(types),
		before: DArray.concat(transformed.before, bound.before),
		callee: bound.result,
	});
}

interface Stage {
	value: GoAST.Identifier;
	type: GoType;
}

function returnStatements(value: GoAST.Expression): readonly GoAST.Statement[] {
	return [GoAST.createReturnStatement({ values: [value] })];
}

interface Body {
	statements: readonly GoAST.Statement[];
	stage: Stage;
}

interface StageParams {
	node: TsAST.Node;
	stage: Stage;
	outputType: GoType;
	// Absent pour la dernière étape : la valeur devient le résultat.
	next?: {
		argument?: GoAST.Identifier;
		parameterType?: GoType;
	};
}

/**
 * Une branche par variante de la valeur d'une étape :
 * - `Left` : `return` (la suite n'est pas exécutée) ;
 * - Right : sa valeur passe à l'étape suivante, ou devient le résultat ;
 * - autre valeur : passe telle quelle, ou devient `success(valeur)` en fin de chaîne.
 */
function dispatchStage({ node, stage, outputType, next }: StageParams, context: BuildContext) {
	const returnValue = (expression: GoAST.Expression, sourceType: GoType) => DCommon.pipe(
		convertToType(
			{
				node,
				expression,
				sourceType,
				targetType: outputType,
			},
			context,
		),
		(converted) => DEither.isLeft(converted)
			? converted
			: DEither.right("statements", returnStatements(DEither.unwrapRight(converted))),
	);

	const passValue = (expression: GoAST.Expression, sourceType: GoType) => {
		if (!next) {
			return returnValue(expression, sourceType);
		}

		if (!next.argument || !next.parameterType) {
			return DEither.right("statements", [] as readonly GoAST.Statement[]);
		}

		const converted = convertToType(
			{
				node,
				expression,
				sourceType,
				targetType: next.parameterType,
			},
			context,
		);

		if (DEither.isLeft(converted)) {
			return converted;
		}

		return DEither.right("statements", [
			GoAST.createAssignmentStatement({
				targets: DCommon.cast([next.argument]),
				values: DCommon.cast([DEither.unwrapRight(converted)]),
			}),
		] as readonly GoAST.Statement[]);
	};

	const branches = DArray.map(getVariants(stage.value, stage.type), (variant) => {
		const statements = DCommon.pipe(
			undefined,
			() => {
				if (hasEitherVariantKind(variant.type, "left")) {
					return returnValue(variant.access, variant.type);
				}

				if (hasEitherVariantKind(variant.type, "right")) {
					return next
						? passValue(
							GoAST.createSelectorExpression({
								target: variant.access,
								identifier: valueFieldIdentifier,
							}),
							getRightValueType(variant.type),
						)
						: returnValue(variant.access, variant.type);
				}

				return next
					? passValue(variant.access, variant.type)
					: returnValue(
						GoAST.createCallExpression({
							callee: GoAST.createInstantiationExpression({
								target: GoAST.createSelectorExpression({
									target: context.registerSharedDependency(eitherSuccessDependency.value),
									identifier: successFunctionIdentifier,
								}),
								typeArguments: DCommon.cast([variant.type]),
							}),
							arguments: [variant.access],
						}),
						GoAST.createGenericTypeReference({
							typeReference: GoAST.createPackageTypeReference({
								packageName: context.registerSharedDependency(eitherSuccessDependency.value),
								identifier: GoAST.createIdentifier("EitherSuccess"),
							}),
							typeArguments: DCommon.cast([variant.type]),
						}),
					);
			},
		);

		return DEither.isLeft(statements)
			? statements
			: DEither.right("branch", {
				test: variant.tagTest,
				statements: DEither.unwrapRight(statements),
			} satisfies Branch);
	});

	const failed = DArray.find(branches, DEither.isLeft);

	if (failed) {
		return failed;
	}

	return DEither.right(
		"stage",
		flattenChain(chainBranches(DArray.map(DArray.filter(branches, DEither.isRight), DEither.unwrapRight))),
	);
}

/**
 * `DEither.rightPipe(input, step1, step2…)` : enchaîne des étapes qui peuvent échouer.
 *
 * Comme DuploJS à l'exécution : un `Left` (entrée ou résultat d'une étape) arrête tout et
 * devient le résultat ; sinon chaque étape reçoit la valeur (déballée d'un Right) ;
 * en fin de chaîne, un Right est renvoyé tel quel, une autre valeur devient `success`.
 *
 * Une fonction Go appelée sur place : ses `return` anticipés traduisent l'arrêt.
 *
 * ```go
 * out := func() Out {
 *     var argument1 P1
 *     if in.Tag == 0 { return Out{…in.V0} }   // Left : arrêt
 *     else { argument1 = in.V1.Value }        // Success : valeur
 *     result1 := step1(argument1)
 *     if result1.Tag == 0 { return … } else { return … }
 * }()
 * ```
 *
 * Tous les arguments sont évalués avant, une fois, dans l'ordre, comme en JS.
 */
export async function rightPipeExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-rightPipe-as-value");
	}

	const [inputNode, ...stepNodes] = node.arguments;

	if (!inputNode || !DArray.minElements(stepNodes, 1)) {
		return context.error(node, "un-support-rightPipe-arguments");
	}

	const { typeChecker } = context.transpilation;

	const input = await DCommon.asyncPipe(
		context.transform(inputNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(input)) {
		return input;
	}

	const boundInput = bindOnce(input.result, context);

	const preparedSteps = await DCommon.asyncPipe(
		stepNodes,
		DArray.map((stepNode) => prepareStep(stepNode, context)),
		DCommon.promiseAll,
	);

	const failedStep = DArray.find(preparedSteps, DEither.isLeft);

	if (failedStep) {
		return failedStep;
	}

	const steps = DArray.map(DArray.filter(preparedSteps, DEither.isRight), DEither.unwrapRight);

	const inputType = await transformCheckerType(await typeChecker.getTypeAtLocation(inputNode), inputNode, context);

	if (DEither.isLeft(inputType)) {
		return inputType;
	}

	const outputType = await transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const goOutputType = DEither.unwrapRight(outputType);

	const body = await DArray.reduce(
		steps,
		DArray.reduceFrom<
			TransformationError | NotfoundTransformer | DEither.Right<"body", Body>
		>(
			DEither.right("body", {
				statements: [],
				stage: {
					value: boundInput.result as GoAST.Identifier,
					type: DEither.unwrapRight(inputType),
				},
			}),
		),
		({ element: step, lastValue, next }) => {
			if (DEither.isLeft(lastValue)) {
				return next(lastValue);
			}

			const { statements, stage } = DEither.unwrapRight(lastValue);
			const argument = step.parameterType && context.generateIdentifier();
			const result = context.generateIdentifier();

			const dispatched = dispatchStage(
				{
					node,
					stage,
					outputType: goOutputType,
					next: {
						argument,
						parameterType: step.parameterType,
					},
				},
				context,
			);

			if (DEither.isLeft(dispatched)) {
				return next(dispatched);
			}

			return next(DEither.right("body", {
				statements: DArray.concat(
					statements,
					argument && step.parameterType
						? [
							GoAST.createVariableDeclarationZeroValue({
								identifier: argument,
								typeReference: step.parameterType,
							}),
						]
						: [],
					DEither.unwrapRight(dispatched),
					[
						GoAST.createShortVariableDeclarationStatement({
							identifier: result,
							initializer: createFunctionValueCall(
								step.callee,
								argument ? [argument] : [],
								step.parameterCount,
							),
						}),
					],
				),
				stage: {
					value: result,
					type: step.returnType,
				},
			}));
		},
	);

	if (DEither.isLeft(body)) {
		return body;
	}

	const { statements, stage } = DEither.unwrapRight(body);

	const last = dispatchStage(
		{
			node,
			stage,
			outputType: goOutputType,
		},
		context,
	);

	if (DEither.isLeft(last)) {
		return last;
	}

	return context.success({
		before: DArray.concat(
			input.before,
			boundInput.before,
			DArray.flatMap(steps, ({ before }) => before),
		),
		result: GoAST.createCallExpression({
			callee: GoAST.createFunctionLiteral({
				arguments: [],
				returnTypes: [goOutputType],
				body: GoAST.createBlockStatement({
					statements: DArray.concat(statements, DEither.unwrapRight(last)),
				}),
			}),
			arguments: [],
		}),
	});
}
