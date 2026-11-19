import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const mapFunctionIdentifier = GoAST.createIdentifier("Map");

/**
 * `DArray.map(array, f)` : un nouveau tableau, même longueur, même ordre.
 *
 * ```go
 * func Map[T any, R any](array []T, theFunction func(T) R) []R {
 *     result := make([]R, len(array))
 *     for index, element := range array {
 *         result[index] = theFunction(element)
 *     }
 *     return result
 * }
 * ```
 */
export const mapDependency = DCommon.memo(() => {
	const elementGeneric = GoAST.createIdentifier("T");
	const resultGeneric = GoAST.createIdentifier("R");
	const array = GoAST.createIdentifier("array");
	const theFunction = GoAST.createIdentifier("theFunction");
	const result = GoAST.createIdentifier("result");
	const index = GoAST.createIdentifier("index");
	const element = GoAST.createIdentifier("element");
	const resultType = GoAST.createSliceType({ elementType: resultGeneric });

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: mapFunctionIdentifier,
				generic: [
					GoAST.createTypeParameter({
						identifier: elementGeneric,
						constraint: GoAST.builtinTypeReferences.any,
					}),
					GoAST.createTypeParameter({
						identifier: resultGeneric,
						constraint: GoAST.builtinTypeReferences.any,
					}),
				],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: array,
						type: GoAST.createSliceType({ elementType: elementGeneric }),
					}),
					GoAST.createFunctionArgument({
						identifier: theFunction,
						type: GoAST.createFunctionType({
							arguments: [
								GoAST.createFunctionArgument({
									identifier: element,
									type: elementGeneric,
								}),
							],
							returnTypes: [resultGeneric],
						}),
					}),
				],
				returnTypes: [resultType],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createShortVariableDeclarationStatement({
							identifier: result,
							initializer: GoAST.createCallExpression({
								callee: GoAST.createIdentifier("make"),
								typeArgument: resultType,
								arguments: [
									GoAST.createCallExpression({
										callee: GoAST.createIdentifier("len"),
										arguments: [array],
									}),
								],
							}),
						}),
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({
								key: index,
								value: element,
							}),
							expression: array,
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createAssignmentStatement({
										targets: DCommon.cast([
											GoAST.createIndexExpression({
												target: result,
												index,
											}),
										]),
										values: DCommon.cast([
											GoAST.createCallExpression({
												callee: theFunction,
												arguments: [element],
											}),
										]),
									}),
								],
							}),
						}),
						GoAST.createReturnStatement({ values: [result] }),
					],
				}),
			}),
		],
	});
});
