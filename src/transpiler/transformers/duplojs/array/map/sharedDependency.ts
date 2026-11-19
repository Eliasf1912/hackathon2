import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const mapFunctionIdentifier = GoAST.createIdentifier("ArrayMap");

export const arrayMapDependency = DCommon.memo(() => {
	const sliceAnyType = GoAST.createSliceType({
		elementType: GoAST.builtinTypeReferences.any,
	});

	const curryArg0 = GoAST.createIndexExpression({
		target: GoAST.createIdentifier("curryArgs"),
		index: GoAST.createIntegerLiteral({ value: 0n }),
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: mapFunctionIdentifier,
				generic: [],
				arguments: [],
				variadicArgument: GoAST.createFunctionArgument({
					identifier: GoAST.createIdentifier("args"),
					type: GoAST.builtinTypeReferences.any,
				}),
				returnTypes: [GoAST.builtinTypeReferences.any],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createIfStatement({
							condition: GoAST.createBinaryExpression({
								operator: "==",
								left: GoAST.createCallExpression({
									callee: GoAST.createIdentifier("len"),
									arguments: [GoAST.createIdentifier("args")],
								}),
								right: GoAST.createIntegerLiteral({ value: 1n }),
							}),
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createShortVariableDeclarationStatement({
										identifier: GoAST.createIdentifier("fn"),
										initializer: GoAST.createIndexExpression({
											target: GoAST.createIdentifier("args"),
											index: GoAST.createIntegerLiteral({ value: 0n }),
										}),
									}),
									GoAST.createReturnStatement({
										values: [
											GoAST.createFunctionLiteral({
												arguments: [],
												variadicArgument: GoAST.createFunctionArgument({
													identifier: GoAST.createIdentifier("curryArgs"),
													type: GoAST.builtinTypeReferences.any,
												}),
												returnTypes: [GoAST.builtinTypeReferences.any],
												body: GoAST.createBlockStatement({
													statements: [
														GoAST.createReturnStatement({
															values: [
																GoAST.createCallExpression({
																	callee: mapFunctionIdentifier,
																	arguments: [
																		curryArg0,
																		GoAST.createIdentifier("fn"),
																	],
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
						GoAST.createShortVariableDeclarationStatement({
							identifier: GoAST.createIdentifier("arr"),
							initializer: GoAST.createIndexExpression({
								target: GoAST.createIdentifier("args"),
								index: GoAST.createIntegerLiteral({ value: 0n }),
							}),
						}),
						GoAST.createShortVariableDeclarationStatement({
							identifier: GoAST.createIdentifier("fn"),
							initializer: GoAST.createIndexExpression({
								target: GoAST.createIdentifier("args"),
								index: GoAST.createIntegerLiteral({ value: 1n }),
							}),
						}),
						GoAST.createShortVariableDeclarationStatement({
							identifier: GoAST.createIdentifier("slice"),
							initializer: GoAST.createSliceLiteral({
								typeReference: sliceAnyType,
								elements: [],
							}),
						}),
						GoAST.createTypeSwitchStatementWithoutDefault({
							identifier: GoAST.createIdentifier("a"),
							expression: GoAST.createIdentifier("arr"),
							cases: [
								GoAST.createTypeSwitchCase({
									types: DCommon.cast([sliceAnyType]),
									statements: [
										GoAST.createAssignmentStatement({
											targets: DCommon.cast([GoAST.createIdentifier("slice")]),
											values: DCommon.cast([GoAST.createIdentifier("a")]),
										}),
									],
								}),
							],
						}),
						GoAST.createShortVariableDeclarationStatement({
							identifier: GoAST.createIdentifier("result"),
							initializer: GoAST.createCallExpression({
								callee: GoAST.createIdentifier("make"),
								typeArgument: sliceAnyType,
								arguments: [
									GoAST.createIntegerLiteral({ value: 0n }),
									GoAST.createCallExpression({
										callee: GoAST.createIdentifier("len"),
										arguments: [GoAST.createIdentifier("slice")],
									}),
								],
							}),
						}),
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({
								key: GoAST.createIdentifier("_"),
								value: GoAST.createIdentifier("item"),
							}),
							expression: GoAST.createIdentifier("slice"),
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createShortVariableDeclarationStatement({
										identifier: GoAST.createIdentifier("val"),
										initializer: GoAST.createIdentifier("item"),
									}),
									GoAST.createTypeSwitchStatementWithoutDefault({
										identifier: GoAST.createIdentifier("f"),
										expression: GoAST.createIdentifier("fn"),
										cases: [
											GoAST.createTypeSwitchCase({
												types: DCommon.cast([
													GoAST.createFunctionType({
														arguments: [],
														variadicArgument: GoAST.createFunctionArgument({
															identifier: GoAST.createIdentifier("a"),
															type: GoAST.builtinTypeReferences.any,
														}),
														returnTypes: [GoAST.builtinTypeReferences.any],
													}),
												]),
												statements: [
													GoAST.createAssignmentStatement({
														targets: DCommon.cast([GoAST.createIdentifier("val")]),
														values: DCommon.cast([
															GoAST.createCallExpression({
																callee: GoAST.createIdentifier("f"),
																arguments: [GoAST.createIdentifier("item")],
															}),
														]),
													}),
												],
											}),
											GoAST.createTypeSwitchCase({
												types: DCommon.cast([
													GoAST.createFunctionType({
														arguments: [
															GoAST.createFunctionArgument({
																identifier: GoAST.createIdentifier("a"),
																type: GoAST.builtinTypeReferences.any,
															}),
														],
														returnTypes: [GoAST.builtinTypeReferences.any],
													}),
												]),
												statements: [
													GoAST.createAssignmentStatement({
														targets: DCommon.cast([GoAST.createIdentifier("val")]),
														values: DCommon.cast([
															GoAST.createCallExpression({
																callee: GoAST.createIdentifier("f"),
																arguments: [GoAST.createIdentifier("item")],
															}),
														]),
													}),
												],
											}),
										],
									}),
									GoAST.createAssignmentStatement({
										targets: DCommon.cast([GoAST.createIdentifier("result")]),
										values: DCommon.cast([
											GoAST.createCallExpression({
												callee: GoAST.createIdentifier("append"),
												arguments: [
													GoAST.createIdentifier("result"),
													GoAST.createIdentifier("val"),
												],
											}),
										]),
									}),
								],
							}),
						}),
						GoAST.createReturnStatement({
							values: [GoAST.createIdentifier("result")],
						}),
					],
				}),
			}),
		],
	});
});
