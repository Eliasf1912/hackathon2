import { GoAST } from "@go";
import { type NotfoundTransformer, type TransformationError } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import {
	canConvertToType,
	convertToType,
	transformCheckerType,
	type GoType,
} from "../../type/union";
import { createCurriedFunction } from "../curried";
import {
	callFunctionValue,
	chainBranches,
	flattenChain,
	getFunctionValueTypes,
	getVariants,
	type Branch,
	type FunctionValue,
} from "./dispatch";
import { createNullishReference } from "../../expression/nullish";
import { bindOnce } from "./isRight";
import { getEitherVariant, informationFieldIdentifier, valueFieldIdentifier } from "./sharedDependency";

/**
 * Gestionnaire du matcher (`{ success: (value) => …, "negative-operand": () => … }`),
 * transformé et rangé (évalué une fois), avec les types de sa propre signature.
 */
interface Handler extends FunctionValue {
	information: string;
	before: readonly GoAST.Statement[];
	returnType: GoType;
}

type HandlerResult = TransformationError | NotfoundTransformer | DEither.Right<"handler", Handler>;

function getPropertyName(name: TsAST.PropertyName) {
	return TsAST.isIdentifier(name) || TsAST.isStringLiteral(name)
		? name.text
		: undefined;
}

async function prepareHandler(property: TsAST.ObjectLiteralElementLike, context: BuildContext): Promise<HandlerResult> {
	if (!TsAST.isPropertyAssignment(property)) {
		return context.error(property, "un-support-matcher-property");
	}

	const information = getPropertyName(property.name);

	if (information === undefined) {
		return context.error(property.name, "un-support-matcher-key");
	}

	const handlerNode = property.initializer;

	const transformed = await DCommon.asyncPipe(
		context.transform(handlerNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(transformed)) {
		return transformed;
	}

	const types = await getFunctionValueTypes(handlerNode, context);

	if (DEither.isLeft(types)) {
		return types;
	}

	const bound = bindOnce(transformed.result, context);

	return DEither.right("handler", {
		...DEither.unwrapRight(types),
		information,
		before: DArray.concat(transformed.before, bound.before),
		callee: bound.result,
	});
}

/**
 * Type de la valeur d'une variante : argument du type générique (`EitherLeft[float64]`),
 * ou `JSUndefined` pour une variante sans champ `Value` (`EitherFail`).
 */
function getVariantValueType(type: GoType, hasValue: boolean, undefinedType: GoType) {
	if (!hasValue) {
		return undefinedType;
	}

	return DModeling.hasTagValue(type, "[node]type-reference-generic")
		? DArray.first(type.typeArguments)
		: undefined;
}

interface ApplyMatchParams {
	node: TsAST.Node;
	input: GoAST.Expression;
	inputType: GoType;
	outputType: GoType;
	handlers: readonly Handler[];
}

/**
 * Une branche par variante de l'entrée :
 * - valeur qui n'est pas un Either : renvoyée telle quelle, comme `matchInformation`
 *   à l'exécution ;
 * - `Fail` : son gestionnaire reçoit `JSUndefined{}` (sa valeur JS est `undefined`) ;
 * - information fixe (`Success` : "success") : son gestionnaire, choisi à la compilation ;
 * - `Left` / `Right` génériques : test du champ `Information` à l'exécution, parmi les
 *   gestionnaires dont le paramètre a le type de la valeur.
 */
function applyMatch(
	{ node, input, inputType, outputType, handlers }: ApplyMatchParams,
	context: BuildContext,
) {
	const boundInput = bindOnce(input, context);
	const output = context.generateIdentifier();
	const usedHandlers = new Set<Handler>();

	const variants = getVariants(boundInput.result, inputType);

	const assignOutput = (expression: GoAST.Expression, sourceType: GoType, test?: GoAST.Expression) => {
		const value = convertToType(
			{
				node,
				expression,
				sourceType,
				targetType: outputType,
			},
			context,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		return DEither.right("branch", {
			test,
			statements: [
				GoAST.createAssignmentStatement({
					targets: DCommon.cast([output]),
					values: DCommon.cast([DEither.unwrapRight(value)]),
				}),
			],
		} satisfies Branch);
	};

	// Une information fixée par une variante de l'union (`"success"`) n'est jamais celle
	// d'un `Left` / `Right` générique de la même union.
	const fixedInformations = new Set(
		DArray.map(variants, ({ type }) => getEitherVariant(type)?.information),
	);

	const variantBranches = DArray.map(variants, (variant) => {
		const description = getEitherVariant(variant.type);

		if (!description) {
			return assignOutput(variant.access, variant.type, variant.tagTest);
		}

		// `EitherFail` n'a pas de champ `Value` : en JS, sa valeur est `undefined`.
		const undefinedType = createNullishReference("undefined", context);

		const valueType = getVariantValueType(variant.type, description.hasValue, undefinedType);

		const value = description.hasValue
			? GoAST.createSelectorExpression({
				target: variant.access,
				identifier: valueFieldIdentifier,
			})
			: GoAST.createStructLiteral({
				typeReference: undefinedType,
				elements: [],
			});

		const candidates = DArray.filter(
			handlers,
			(handler) => (
				description.information === undefined
					? !fixedInformations.has(handler.information)
					: handler.information === description.information
			)
				&& (
					handler.parameterType === undefined
					|| (valueType !== undefined && canConvertToType(valueType, handler.parameterType))
				),
		);

		const handlerBranches = DArray.map(candidates, (handler) => {
			usedHandlers.add(handler);

			const call = callFunctionValue(
				{
					node,
					functionValue: handler,
					value,
					valueType: valueType ?? undefinedType,
				},
				context,
			);

			if (DEither.isLeft(call)) {
				return call;
			}

			return assignOutput(
				DEither.unwrapRight(call),
				handler.returnType,
				description.information === undefined
					? GoAST.createBinaryExpression({
						operator: "==",
						left: GoAST.createSelectorExpression({
							target: variant.access,
							identifier: informationFieldIdentifier,
						}),
						right: GoAST.createStringLiteral({ value: handler.information }),
					})
					: undefined,
			);
		});

		const failed = DArray.find(handlerBranches, DEither.isLeft);

		if (failed) {
			return failed;
		}

		if (DArray.lengthEqual(candidates, 0)) {
			return context.error(node, "un-support-matcher-missing-handler");
		}

		return DEither.right("variant-branch", {
			test: variant.tagTest,
			statements: flattenChain(
				chainBranches(DArray.map(DArray.filter(handlerBranches, DEither.isRight), DEither.unwrapRight)),
			),
		});
	});

	const failedVariant = DArray.find(variantBranches, DEither.isLeft);

	if (failedVariant) {
		return failedVariant;
	}

	const branches: readonly Branch[] = DArray.map(
		DArray.filter(variantBranches, DEither.isRight),
		DEither.unwrapRight,
	);

	// Un gestionnaire jamais appelé doit être utilisé pour que Go compile (`_ = h`).
	const unusedHandlers = DArray.map(
		DArray.filter(handlers, (handler) => !usedHandlers.has(handler)),
		(handler) => GoAST.createAssignmentStatement({
			targets: DCommon.cast([GoAST.createIdentifier("_")]),
			values: DCommon.cast([handler.callee]),
		}),
	);

	return DEither.right("match-applied", {
		before: DArray.concat(
			boundInput.before,
			unusedHandlers,
			[
				GoAST.createVariableDeclarationZeroValue({
					identifier: output,
					typeReference: outputType,
				}),
			],
			flattenChain(chainBranches(branches)),
		),
		result: output as GoAST.Expression,
	});
}

/**
 * `DEither.matchInformation(input, matcher)` et sa forme curryfiée `matchInformation(matcher)`.
 * Le matcher doit être un objet littéral (`{ clé: fonction }`), dont les fonctions sont
 * évaluées une fois, dans l'ordre.
 */
export async function matchInformationExpressionHandler(node: TsAST.Node, context: BuildContext) {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "un-support-matchInformation-as-value");
	}

	const isCurried = DArray.lengthEqual(node.arguments, 1);

	if (!isCurried && !DArray.lengthEqual(node.arguments, 2)) {
		return context.error(node, "un-support-matchInformation-arguments");
	}

	const matcherNode = DArray.last(node.arguments);

	if (!matcherNode || !TsAST.isObjectLiteralExpression(matcherNode)) {
		return context.error(node, "un-support-matcher-not-object-literal");
	}

	const inputNode = isCurried ? undefined : DArray.first(node.arguments);

	const input = inputNode && await DCommon.asyncPipe(
		context.transform(inputNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (input && DEither.isLeft(input)) {
		return input;
	}

	// L'entrée est rangée avant les gestionnaires : JS évalue les arguments dans l'ordre.
	const boundInput = input && bindOnce(input.result, context);

	const preparedHandlers = await DCommon.asyncPipe(
		matcherNode.properties,
		DArray.map((property) => prepareHandler(property, context)),
		DCommon.promiseAll,
	);

	const failedHandler = DArray.find(preparedHandlers, DEither.isLeft);

	if (failedHandler) {
		return failedHandler;
	}

	const handlers = DArray.map(DArray.filter(preparedHandlers, DEither.isRight), DEither.unwrapRight);
	const handlersBefore = DArray.flatMap(handlers, ({ before }) => before);

	if (!input || !inputNode || !boundInput) {
		const curried = await createCurriedFunction(
			node,
			context,
			(curriedInput, inputType, outputType) => applyMatch(
				{
					node,
					input: curriedInput,
					inputType,
					outputType,
					handlers,
				},
				context,
			),
		);

		if (DEither.isLeft(curried)) {
			return curried;
		}

		return context.success({
			before: handlersBefore,
			result: DEither.unwrapRight(curried),
		});
	}

	const { typeChecker } = context.transpilation;

	const inputType = await transformCheckerType(await typeChecker.getTypeAtLocation(inputNode), inputNode, context);

	if (DEither.isLeft(inputType)) {
		return inputType;
	}

	const outputType = await transformCheckerType(await typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const applied = applyMatch(
		{
			node,
			input: boundInput.result,
			inputType: DEither.unwrapRight(inputType),
			outputType: DEither.unwrapRight(outputType),
			handlers,
		},
		context,
	);

	if (DEither.isLeft(applied)) {
		return applied;
	}

	const { before, result } = DEither.unwrapRight(applied);

	return context.success({
		before: DArray.concat(input.before, boundInput.before, handlersBefore, before),
		result,
	});
}
