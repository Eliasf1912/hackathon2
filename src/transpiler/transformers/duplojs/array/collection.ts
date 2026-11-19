import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { type TsAST } from "@typescript";
import { type BuildContext } from "../../../context/build";
import { undefinedShardDependency } from "../../../sharedDependency/defaults";
import { unionDependency, unionTagFieldIdentifier, unionTypeIdentifier, unionValueFieldIdentifier } from "../../type/union/sharedDependency";
import { simpleFunctionHandler } from "../simpleFunction";

const generic = GoAST.createIdentifier("T");
const array = GoAST.createIdentifier("array");
const callback = GoAST.createIdentifier("callback");
const element = GoAST.createIdentifier("element");
const result = GoAST.createIdentifier("result");
const sliceOfGeneric = GoAST.createSliceType({ elementType: generic });
const typeParameter = GoAST.createTypeParameter({
	identifier: generic,
	constraint: GoAST.builtinTypeReferences.any,
});

function call(callee: GoAST.Expression, callArguments: readonly GoAST.Expression[], variadic?: GoAST.Expression) {
	return GoAST.createCallExpression({
		callee,
		arguments: callArguments,
		variadicArgument: variadic,
	});
}

function block(statements: readonly GoAST.Statement[]) {
	return GoAST.createBlockStatement({ statements });
}

function returnValue(value: GoAST.Expression) {
	return GoAST.createReturnStatement({ values: [value] });
}

// `for _, element := range array { if callback(element) { … } }`
function forEachMatching(body: readonly GoAST.Statement[]) {
	return GoAST.createRangeStatement({
		binding: GoAST.createRangeDeclaration({
			key: GoAST.createIdentifier("_"),
			value: element,
		}),
		expression: array,
		body: block([
			GoAST.createIfStatement({
				condition: call(callback, [element]),
				body: block(body),
			}),
		]),
	});
}

function declareFunction(
	name: string,
	returnType: GoAST.Type | GoAST.TypeReference,
	secondArgument: GoAST.FunctionArgument,
	statements: readonly GoAST.Statement[],
) {
	return GoAST.createFunctionDeclaration({
		identifier: GoAST.createIdentifier(name),
		generic: [typeParameter],
		arguments: [
			GoAST.createFunctionArgument({
				identifier: array,
				type: sliceOfGeneric,
			}),
			secondArgument,
		],
		returnTypes: [returnType],
		body: block(statements),
	});
}

const predicateArgument = GoAST.createFunctionArgument({
	identifier: callback,
	type: GoAST.createFunctionType({
		arguments: [
			GoAST.createFunctionArgument({
				identifier: element,
				type: generic,
			}),
		],
		returnTypes: [GoAST.builtinTypeReferences.bool],
	}),
});

/**
 * Fonctions Go partagées pour `DArray` :
 *
 * ```go
 * func Filter[T any](array []T, callback func(T) bool) []T      // garde l'ordre
 * func Some[T any](array []T, callback func(T) bool) bool       // s'arrête au premier
 * func Find[T any](array []T, callback func(T) bool) Union2[JSUndefined, T]
 * func Concat[T any](array []T, elements []T) []T               // nouveau tableau
 * ```
 *
 * `Find` renvoie `T | undefined` : `undefined` est toujours la variante 0 d'une union, sa
 * valeur zéro (`Union2[JSUndefined, T]{}`) veut donc dire « non trouvé ».
 */
const collectionDependency = DCommon.memo(() => {
	const optional = GoAST.createGenericTypeReference({
		typeReference: unionTypeIdentifier(2),
		typeArguments: DCommon.cast([GoAST.createIdentifier("JSUndefined"), generic]),
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			declareFunction("Filter", sliceOfGeneric, predicateArgument, [
				GoAST.createShortVariableDeclarationStatement({
					identifier: result,
					initializer: GoAST.createCallExpression({
						callee: GoAST.createIdentifier("make"),
						typeArgument: sliceOfGeneric,
						arguments: [GoAST.createIntegerLiteral({ value: 0n }), call(GoAST.createIdentifier("len"), [array])],
					}),
				}),
				forEachMatching([
					GoAST.createAssignmentStatement({
						targets: DCommon.cast([result]),
						values: DCommon.cast([call(GoAST.createIdentifier("append"), [result, element])]),
					}),
				]),
				returnValue(result),
			]),
			declareFunction("Some", GoAST.builtinTypeReferences.bool, predicateArgument, [
				forEachMatching([returnValue(GoAST.createBooleanLiteral({ value: true }))]),
				returnValue(GoAST.createBooleanLiteral({ value: false })),
			]),
			declareFunction("Find", optional, predicateArgument, [
				forEachMatching([
					returnValue(GoAST.createStructLiteral({
						typeReference: optional,
						elements: [
							GoAST.createKeyedElement({
								key: unionTagFieldIdentifier,
								value: GoAST.createIntegerLiteral({ value: 1n }),
							}),
							GoAST.createKeyedElement({
								key: unionValueFieldIdentifier(1),
								value: element,
							}),
						],
					})),
				]),
				returnValue(GoAST.createStructLiteral({
					typeReference: optional,
					elements: [],
				})),
			]),
			declareFunction(
				"Concat",
				sliceOfGeneric,
				GoAST.createFunctionArgument({
					identifier: element,
					type: sliceOfGeneric,
				}),
				[
					returnValue(call(
						GoAST.createIdentifier("append"),
						[
							call(
								GoAST.createIdentifier("append"),
								[
									GoAST.createCallExpression({
										callee: GoAST.createIdentifier("make"),
										typeArgument: sliceOfGeneric,
										arguments: [GoAST.createIntegerLiteral({ value: 0n })],
									}),
								],
								array,
							),
						],
						element,
					)),
				],
			),
		],
	});
});

function sharedCall(name: string, callArguments: readonly GoAST.Expression[], context: BuildContext) {
	context.registerSharedDependency(undefinedShardDependency.value);
	context.registerSharedDependency(unionDependency(DCommon.cast([undefined, undefined])));

	return GoAST.createCallExpression({
		callee: GoAST.createSelectorExpression({
			target: context.registerSharedDependency(collectionDependency.value),
			identifier: GoAST.createIdentifier(name),
		}),
		arguments: callArguments,
	});
}

/**
 * `DArray.filter`, `some`, `find`, `concat` (formes directe et curryfiée) → fonctions Go
 * partagées ; `DArray.lengthEqual(tableau, n)` → `float64(len(tableau)) == n`.
 *
 * Limite connue : une fonction qui utilise le 2ᵉ paramètre (`{ index, self }`) ; un
 * prédicat de garde de type (`filter(x, isRight)`) qui change le type des éléments.
 */
export function collectionExpressionHandler(node: TsAST.Node, name: string, context: BuildContext) {
	if (name === "lengthEqual") {
		return simpleFunctionHandler(
			{
				node,
				name,
				arity: 2,
				build: ([value, length]) => value && length && GoAST.createBinaryExpression({
					operator: "==",
					left: GoAST.createConversionExpression({
						typeReference: GoAST.builtinTypeReferences.float64,
						operand: call(GoAST.createIdentifier("len"), [value]),
					}),
					right: length,
				}),
			},
			context,
		);
	}

	const goName = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

	return simpleFunctionHandler(
		{
			node,
			name,
			arity: 2,
			build: ([value, argument]) => value && argument && sharedCall(goName, [value, argument], context),
		},
		context,
	);
}
