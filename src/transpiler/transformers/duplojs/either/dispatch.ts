import * as DArray from "@duplojs/lang/array";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import * as DEither from "@duplojs/lang/either";
import { type TsAST } from "@typescript";
import { type BuildContext } from "../../../context/build";
import { createFunctionValueCall, getDeclaredParameterCount, getFunctionValueSignature } from "../../shared";
import {
	convertToType,
	createUnionTagTest,
	createUnionVariantAccess,
	getUnionType,
	transformCheckerType,
	type GoType,
} from "../../type/union";

export interface Variant {
	type: GoType;
	access: GoAST.Expression;
	tagTest?: GoAST.Expression;
}

export interface Branch {
	test?: GoAST.Expression;
	statements: readonly GoAST.Statement[];
}

/**
 * Les variantes d'une valeur Go : chaque membre d'une union (`UnionN`), avec son accès
 * (`x.V1`) et son test (`x.Tag == 1`) ; sinon la valeur elle-même, sans test.
 * `value` doit pouvoir être relue sans être réévaluée (identifiant).
 */
export function getVariants(value: GoAST.Expression, type: GoType): readonly Variant[] {
	const unionType = getUnionType(type);

	if (!unionType) {
		return [
			{
				type,
				access: value,
			},
		];
	}

	return DArray.map(unionType.typeArguments, (memberType, { index }) => ({
		type: memberType,
		access: createUnionVariantAccess(value, index),
		tagTest: createUnionTagTest(value, index),
	}));
}

/**
 * `if test0 {…} else if test1 {…} else {…}` ; la dernière branche sert de `else`
 * (TS garantit qu'une des branches s'applique).
 */
export function chainBranches(branches: readonly Branch[]) {
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

/**
 * Instructions d'une chaîne : le `if`, ou directement celles de l'unique branche.
 */
export function flattenChain(chain: GoAST.BlockStatement | GoAST.IfStatement | undefined): readonly GoAST.Statement[] {
	if (!chain) {
		return [];
	}

	return DModeling.hasTagValue(chain, "[node][statement]if")
		? [chain]
		: chain.statements;
}

/**
 * Fonction passée en valeur (`whenIsRight(f)`, gestionnaire de `matchInformation`…),
 * déjà rangée, avec le paramètre qu'elle déclare elle-même.
 */
export interface FunctionValue {
	callee: GoAST.Expression;
	// Absent : la fonction ne déclare aucun paramètre (`() => …`).
	parameterType?: GoType;
	parameterCount: number;
}

/**
 * `f(valeur)`, la valeur d'abord convertie vers le paramètre que `f` déclare
 * (`(v: number | string) => …` reçoit une union) ; sans paramètre, `f()`.
 */
export function callFunctionValue(
	params: {
		node: TsAST.Node;
		functionValue: FunctionValue;
		value: GoAST.Expression;
		valueType: GoType;
	},
	context: BuildContext,
) {
	const { node, functionValue, value, valueType } = params;

	if (!functionValue.parameterType) {
		return DEither.success(createFunctionValueCall(functionValue.callee, [], functionValue.parameterCount));
	}

	const argument = convertToType(
		{
			node,
			expression: value,
			sourceType: valueType,
			targetType: functionValue.parameterType,
		},
		context,
	);

	if (DEither.isLeft(argument)) {
		return argument;
	}

	return DEither.success(createFunctionValueCall(
		functionValue.callee,
		[DEither.unwrapRight(argument)],
		functionValue.parameterCount,
	));
}

/**
 * Types d'une fonction passée en valeur, d'après sa propre signature (ou celle que le
 * contexte instancie si elle est générique) : paramètre (s'il existe) et retour.
 */
export async function getFunctionValueTypes(functionNode: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const signature = await getFunctionValueSignature(functionNode, context);

	if (!signature) {
		return context.error(functionNode, "un-support-function-value-type");
	}

	const parameterType = DArray.lengthEqual(signature.parameters, 0)
		? undefined
		: await transformCheckerType(await typeChecker.getParameterType(signature, 0), functionNode, context);

	if (parameterType && DEither.isLeft(parameterType)) {
		return parameterType;
	}

	const returnType = await transformCheckerType(
		await typeChecker.getReturnTypeOfSignature(signature),
		functionNode,
		context,
	);

	if (DEither.isLeft(returnType)) {
		return returnType;
	}

	return DEither.right("function-value-types", {
		parameterType: parameterType && DEither.unwrapRight(parameterType),
		returnType: DEither.unwrapRight(returnType),
		parameterCount: await getDeclaredParameterCount(functionNode, context),
	});
}

/**
 * Type de la valeur d'un Right générique (`EitherSuccess[float64]` → `float64`).
 */
export function getRightValueType(type: GoType): GoType {
	return "typeArguments" in type
		? DArray.first(type.typeArguments) ?? type
		: type;
}
