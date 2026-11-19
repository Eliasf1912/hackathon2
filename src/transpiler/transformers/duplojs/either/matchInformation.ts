import { GoAST } from "@go";
import { type NotfoundTransformer, type TransformationError } from "@transformer";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { type BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { createFunctionValueCall, getDeclaredParameterCount } from "../../shared";
import {
	convertToType,
	createUnionTagTest,
	createUnionVariantAccess,
	getUnionType,
	goTypeKey,
	transformCheckerType,
	type GoType,
} from "../../type/union";
import { createCurriedFunction } from "../curried";
import { createNullishReference } from "../../expression/nullish";
import { bindOnce } from "./isRight";
import { getEitherVariant, informationFieldIdentifier, valueFieldIdentifier } from "./sharedDependency";

/**
 * Gestionnaire du matcher (`{ success: (value) => …, "negative-operand": () => … }`),
 * transformé et rangé (évalué une fois), avec les types de sa propre signature.
 */
interface Handler {
	information: string;
	before: readonly GoAST.Statement[];
	callee: GoAST.Expression;
	parameterCount: number;
	parameterType?: GoType;
	returnType: GoType;
}

interface Branch {
	test?: GoAST.Expression;
	statements: readonly GoAST.Statement[];
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

	const { typeChecker } = context.transpilation;
	const handlerNode = property.initializer;

	const transformed = await DCommon.asyncPipe(
		context.transform(handlerNode, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(transformed)) {
		return transformed;
	}

	const signature = DArray.first(await (await typeChecker.getTypeAtLocation(handlerNode)).getCallSignatures());

	if (!signature) {
		return context.error(handlerNode, "un-support-matcher-handler-type");
	}

	const parameterCount = await getDeclaredParameterCount(handlerNode, context);

	const parameterType = parameterCount > 0
		? await transformCheckerType(await typeChecker.getParameterType(signature, 0), handlerNode, context)
		: undefined;

	if (parameterType && DEither.isLeft(parameterType)) {
		return parameterType;
	}

	const returnType = await transformCheckerType(
		await typeChecker.getReturnTypeOfSignature(signature),
		handlerNode,
		context,
	);

	if (DEither.isLeft(returnType)) {
		return returnType;
	}

	const bound = bindOnce(transformed.result, context);

	return DEither.right("handler", {
		information,
		before: DArray.concat(transformed.before, bound.before),
		callee: bound.result,
		parameterCount,
		parameterType: parameterType && DEither.unwrapRight(parameterType),
		returnType: DEither.unwrapRight(returnType),
	});
}

/**
 * `if test0 {…} else if test1 {…} else {…}` ; la dernière branche sert de `else`
 * (TS garantit qu'une des branches s'applique).
 */
function chainBranches(branches: readonly Branch[]) {
	const last = DArray.last(branches);

	return DArray.reduceRight(
		DArray.slice(branches, 0, -1),
		DArray.reduceFrom<GoAST.BlockStatement | GoAST.IfStatement | undefined>(
			last && GoAST.createBlockStatement({ statements: last.statements }),
		),
		({ element, lastValue, next }) => next(
			GoAST.createIfStatement({
				condition: element.test ?? GoAST.createBooleanLiteral({ value: true }),
				body: GoAST.createBlockStatement({ statements: element.statements }),
				elseBranch: lastValue,
			}),
		),
	);
}

function flattenChain(chain: GoAST.BlockStatement | GoAST.IfStatement | undefined): readonly GoAST.Statement[] {
	if (!chain) {
		return [];
	}

	return DModeling.hasTagValue(chain, "[node][statement]if")
		? [chain]
		: chain.statements;
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
	const unionType = getUnionType(inputType);
	const output = context.generateIdentifier();
	const usedHandlers = new Set<Handler>();

	const variants = unionType
		? DArray.map(unionType.typeArguments, (type, { index }) => ({
			type,
			access: createUnionVariantAccess(boundInput.result, index),
			tagTest: createUnionTagTest(boundInput.result, index) as GoAST.Expression | undefined,
		}))
		: [
			{
				type: inputType,
				access: boundInput.result as GoAST.Expression,
				tagTest: undefined,
			},
		];

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
					|| (valueType !== undefined && goTypeKey(handler.parameterType) === goTypeKey(valueType))
				),
		);

		const handlerBranches = DArray.map(candidates, (handler) => {
			usedHandlers.add(handler);

			return assignOutput(
				createFunctionValueCall(
					handler.callee,
					[value],
					handler.parameterCount,
				),
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

	if (!input || !inputNode) {
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
			input: input.result,
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
		before: DArray.concat(input.before, handlersBefore, before),
		result,
	});
}
