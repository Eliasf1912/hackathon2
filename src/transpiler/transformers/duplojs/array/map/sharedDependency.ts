import * as DCommon from "@duplojs/lang/common";
import * as DArray from "@duplojs/lang/array";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const mapFunctionIdentifier = GoAST.createIdentifier("ArrayMap");
export const mapWithFunctionIdentifier = GoAST.createIdentifier("ArrayMapWith");

const elementGeneric = GoAST.createIdentifier("T");
const outputGeneric = GoAST.createIdentifier("O");
const array = GoAST.createIdentifier("array");
const theFunction = GoAST.createIdentifier("theFunction");

const typeParameters = DArray.map(
	[elementGeneric, outputGeneric],
	(identifier) => GoAST.createTypeParameter({
		identifier,
		constraint: GoAST.builtinTypeReferences.any,
	}),
);

const inputSliceType = GoAST.createSliceType({ elementType: elementGeneric });
const outputSliceType = GoAST.createSliceType({ elementType: outputGeneric });

const arrayArgument = GoAST.createFunctionArgument({
	identifier: array,
	type: inputSliceType,
});

const theFunctionArgument = GoAST.createFunctionArgument({
	identifier: theFunction,
	type: GoAST.createFunctionType({
		arguments: [
			GoAST.createFunctionArgument({
				identifier: GoAST.createIdentifier("element"),
				type: elementGeneric,
			}),
		],
		returnTypes: [outputGeneric],
	}),
});

/**
 * Mirrors `DArray.map`: builds a new slice of the same length, keeping the
 * order, with the function applied to each element. Go has no map function on
 * slices: the runtime walks the slice with a `range` loop.
 */
export const arrayMapDependency = DCommon.memo(() => {
	const output = GoAST.createIdentifier("output");
	const index = GoAST.createIdentifier("index");
	const element = GoAST.createIdentifier("element");

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: mapFunctionIdentifier,
				generic: typeParameters,
				arguments: [arrayArgument, theFunctionArgument],
				returnTypes: [outputSliceType],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createShortVariableDeclarationStatement({
							identifier: output,
							initializer: GoAST.createCallExpression({
								callee: GoAST.createIdentifier("make"),
								typeArgument: outputSliceType,
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
												target: output,
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
						GoAST.createReturnStatement({
							values: [output],
						}),
					],
				}),
			}),
		],
	});
});

/**
 * Curried form `DArray.map(theFunction)`. Requires the `ArrayMap` dependency.
 */
export const arrayMapWithDependency = DCommon.memo(
	() => createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: mapWithFunctionIdentifier,
				generic: typeParameters,
				arguments: [theFunctionArgument],
				returnTypes: [
					GoAST.createFunctionType({
						arguments: [arrayArgument],
						returnTypes: [outputSliceType],
					}),
				],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createReturnStatement({
							values: [
								GoAST.createFunctionLiteral({
									arguments: [arrayArgument],
									returnTypes: [outputSliceType],
									body: GoAST.createBlockStatement({
										statements: [
											GoAST.createReturnStatement({
												values: [
													GoAST.createCallExpression({
														callee: GoAST.createInstantiationExpression({
															target: mapFunctionIdentifier,
															typeArguments: DCommon.cast([
																elementGeneric,
																outputGeneric,
															]),
														}),
														arguments: [array, theFunction],
													}),
												],
											}),
										],
									}),
								}),
							],
						}),
					],
				}),
			}),
		],
	}),
);
