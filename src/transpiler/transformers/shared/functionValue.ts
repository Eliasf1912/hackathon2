import * as DArray from "@duplojs/lang/array";
import { GoAST } from "@go";
import { type TsAST } from "@typescript";
import { type BuildContext } from "../../context/build";
import { getInstantiatedSignature } from "./instantiatedSignature";

/**
 * Nombre de paramètres que déclare une fonction passée en valeur (`() => [-12]` : 0).
 * JS ignore les arguments en trop, Go non : l'appel ne doit passer que ceux-là.
 * Paramètre rest : aucune limite.
 */
export async function getDeclaredParameterCount(functionNode: TsAST.Node, context: BuildContext) {
	const signature = DArray.first(
		await (await context.transpilation.typeChecker.getTypeAtLocation(functionNode)).getCallSignatures(),
	);

	if (!signature || signature.hasRestParameter) {
		return Infinity;
	}

	return signature.parameters.length;
}

/**
 * Appel d'une fonction passée en valeur, limité aux paramètres qu'elle déclare.
 */
export function createFunctionValueCall(
	callee: GoAST.Expression,
	callArguments: readonly GoAST.Expression[],
	parameterCount: number,
) {
	return GoAST.createCallExpression({
		callee,
		arguments: DArray.slice(callArguments, 0, Math.min(parameterCount, callArguments.length)),
	});
}

/**
 * Fonction passée en valeur là où Go attend `func(T0, T1…) R` : si elle déclare moins de
 * paramètres (`() => x`), elle est enveloppée dans une fonction qui ignore les autres.
 */
export function adaptFunctionValue(
	params: {
		callee: GoAST.Expression;
		parameterTypes: readonly (GoAST.Type | GoAST.TypeReference)[];
		returnType: GoAST.Type | GoAST.TypeReference;
		parameterCount: number;
		generateIdentifier(): GoAST.Identifier;
	},
) {
	if (params.parameterCount >= params.parameterTypes.length) {
		return params.callee;
	}

	const parameters = DArray.map(
		params.parameterTypes,
		(type, { index }) => GoAST.createFunctionArgument({
			identifier: index < params.parameterCount
				? params.generateIdentifier()
				: GoAST.createIdentifier("_"),
			type,
		}),
	);

	return GoAST.createFunctionLiteral({
		arguments: parameters,
		returnTypes: [params.returnType],
		body: GoAST.createBlockStatement({
			statements: [
				GoAST.createReturnStatement({
					values: [
						GoAST.createCallExpression({
							callee: params.callee,
							arguments: DArray.map(
								DArray.slice(parameters, 0, params.parameterCount),
								({ identifier }) => identifier,
							),
						}),
					],
				}),
			],
		}),
	});
}

/**
 * Signature d'une fonction passée en valeur : la sienne, sauf si elle est générique
 * (`DString.to`) ; alors celle que le contexte instancie (`(value: number) => string`).
 */
export async function getFunctionValueSignature(functionNode: TsAST.Expression, context: BuildContext) {
	const own = DArray.first(
		await (await context.transpilation.typeChecker.getTypeAtLocation(functionNode)).getCallSignatures(),
	);

	if (own && !own.typeParameters?.length) {
		return own;
	}

	return await getInstantiatedSignature(functionNode, context) ?? own;
}
